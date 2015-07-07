define( [
		'jquery',
		'underscore',
		'qlik',
		'angular',
		'ng!$q',
		'./properties',
		'./initialproperties',
		'./lib/js/extensionUtils',
		'text!./lib/css/style.css',
		'text!./lib/partials/main.ng.html',

		// no return value
		'./lib/directives/swr-collapse'
	],
	function ( $, _, qlik, angular, $q, props, initProps, extensionUtils, cssContent, ngTemplate ) {
		'use strict';

		extensionUtils.addStyleToHeader( cssContent );

		return {

			definition: props,
			initialProperties: initProps,
			snapshot: {canTakeSnapshot: true},
			template: ngTemplate,
			controller: ['$scope', function ( $scope ) {

				$scope.installedExtensions = [];
				$scope.apps = [];
				$scope.isLoading = false;
				$scope.missingExtensions = [];

				$scope.init = function () {

					// Doesn't really help to suppress an error from the engine, the client side error modal will still
					// be shown
					qlik.setOnError( function ( error ) {
						//console.error( error );
					} );

					// First get the list of installed extensions, then we can match them
					// later on with the used ones ...
					getExtensions()
						.then( loadingStatus.bind( null, true ) )
						.then( getApps )
						.then( saveInspectedApps )
						.then( traverseApps )
						.then( saveInspectedApps )
						.then( analyzeExtensionUsage )
						//.then( closeSessionObjects )
						.then( loadingStatus.bind( null, false ) )
						.then( function () {
							console.info( 'apps', $scope.apps );
							angular.noop(); // console.* will be removed in production, so have something inside the function.
						} );
				};

				function loadingStatus ( isLoading ) {
					var deferred = $q.defer();
					setTimeout( function () {
						console.info( 'loadingIndicator', isLoading );
						$scope.isLoading = isLoading;
						if ( !isLoading ) { $scope.loadingStatusHint = '';}
						deferred.resolve( isLoading );
					}, 0 );
					return deferred.promise;
				}

				/**
				 * Get a list of installed extensions.
				 * @returns {*|promise}
				 */
				function getExtensions () {

					$scope.loadingStatusHint = 'Loading extensions ...';

					var deferred = $q.defer();
					qlik.getExtensionList( function ( extensions ) {

							// Filter to only visualization extensions, because we'll also get mashups, visualization-templates and mashup-templates
							var onlyVizExtensions = _.filter( extensions, function ( item ) {
								return item.data.type === 'visualization';
							} );
							_.map( onlyVizExtensions, function ( viz ) {
								viz.usedIn = [];
							} );
							$scope.installedExtensions = onlyVizExtensions;
							deferred.resolve( onlyVizExtensions );
						}
					)
					;
					return deferred.promise;
				}

				/**
				 * Retrieve a list of all apps from the engine.
				 * @returns {*|promise}
				 */
				function getApps () {

					$scope.loadingStatusHint = 'Loading apps ... ';

					console.info( 'getApps' );

					var deferred = $q.defer();
					qlik.getAppList( function ( apps ) {
						deferred.resolve( apps );
					} );
					return deferred.promise;
				}

				/**
				 * Process each app:
				 * - Save the app's meta data to $scope.apps
				 * @param apps
				 */
				function traverseApps ( apps ) {

					$scope.loadingStatusHint = 'Analyze apps ...';

					console.info( 'traverseApps', '(' + apps.length + ')' );

					console.log('traverseApps', apps);
					return $q.all( apps.map( function ( app ) {

						var deferred = $q.defer();
						console.log('app', app);
						processApp( app )
							.then( function ( processedApp ) {
								console.log( '--app processed', processedApp );
								app.missingExtensions = []; 	// Initialize the array
								app.usedExtensions = []; 		// Initialize the array
								deferred.resolve( app );
							} )
							.catch( function ( reply ) {
								console.error( 'Error in processApp', reply );
								deferred.resolve( /*reply*/ );
							} );

						return deferred.promise;
					} ) );
				}

				/**
				 * Process a single app:
				 * - open the app
				 * - Get all sheet objects
				 * @param app
				 * @returns {*|promise}
				 */
				function processApp ( app ) {
					var def = $q.defer();

					console.log( '>> processApp >> app.qDocId', app.qDocId );
					console.log('>> processApp >> qlik', qlik);
					//console.log( 'qlik.currApp().id', qlik.currApp().id );

					//Todo: Check this on server, not clear how this needs to be handled
					var currApp;
					var isCurrentApp = false;
					if ( app.qDocId.replace( '.qvf', '' ) !== qlik.currApp().id ) {
						currApp = qlik.openApp( app.qDocId, {openWithoutData: true} );
						//
						//}
						//catch ( ex ) {
						//	//console.error( 'Error opening app \"' + app.qTitle + '\"', ex );
						//	if ( currApp ) {
						//		currApp.close();
						//	}
						//	deferred.resolve( app );
						//}

					} else {
						currApp = qlik.currApp();
						isCurrentApp = true;
					}
					currApp.getAppObjectList( 'sheet', function ( reply ) {
						app.qAppObjectList = reply.qAppObjectList;
						console.log('processApp >> getAppObjectList >> reply', reply);
						currApp.destroySessionObject(reply.qInfo.qId ).then( function (  ) {
							if ( !isCurrentApp ) { currApp.close(); }
							def.resolve( app );
						});
					} );

					return def.promise;
				}

				/**
				 * Append to the list of visualization extensions where they are used.
				 * @return {*|promise}
				 */
				function analyzeExtensionUsage () {

					$scope.loadingStatusHint = 'Analyze extension usage ... ';

					var deferred = $q.defer();

					_.map( $scope.apps, function ( app ) {
						if ( app.qAppObjectList && app.qAppObjectList.qItems ) {
							_.map( app.qAppObjectList.qItems, function ( sheet ) {
								_.map( sheet.qData.cells, function ( object ) {
									if ( !isNativeObject( object ) ) {
										//console.log( 'ext to search for', object );

										var installedExt = _.findWhere( $scope.installedExtensions, {id: object.type} );
										//console.log( 'masterExtension: >> ', masterExtension );

										// Extension is found, so add the usage to the extensions
										if ( installedExt ) {
											addExtensionUsage( installedExt, app );
											addUsedExtension( app, installedExt );
										} else {
											// Extension is not found
											addMissingExtension( app, object.type );
										}

										deferred.resolve();
									}
								} )
							} )
						}
					} );

					return deferred.promise;
				}

				/**
				 * Add the usage of the extension to the list of extensions
				 * @param ext
				 * @param app
				 */
				function addExtensionUsage ( ext, app ) {

					var appMeta = {
						qDocId: app.qDocId,
						qTitle: app.qTitle,
						qDocName: app.qDocName,
						qMeta: app.qMeta,
						useCount: 1
					};

					if ( !_.findWhere( ext.usedIn, {qDocId: appMeta.qDocId} ) ) {
						ext.usedIn.push( appMeta );
					} else {
						_.findWhere( ext.usedIn, {qDocId: appMeta.qDocId} ).useCount++;
					}
				}

				/**
				 * Add some information to the app, which non-missing extensions are used and how often.
				 *
				 * Property the information is added to:
				 * `app.usedExtensions` as an array of
				 *
				 * ```js
				 * {
				 *  id: "my-extension",
				 * 	ext: {
				 * 	  type: "my-extension",
				 * 	  qTitle: "My Extension",
				 * 	  description: "...",
				 * 	  name: "...",
				 * 	  author: "...",
				 * 	  version: "..."
				 * 	  ...
				 * 	},
				 * 	useCount: 1
				 * }
				 * ```
				 *
				 * @param app
				 * @param ext
				 */
				function addUsedExtension ( app, ext ) {

					//console.log( 'addUsedExtension', ext );
					//console.log( '--addUsedExtension > app', app );

					if ( !_.findWhere( app.usedExtensions, {"id": ext.id} ) ) {
						app.usedExtensions.push( {
							id: ext.id,
							ext: {
								type: ext.id,
								author: ext.data.author,
								description: ext.data.description,
								name: ext.data.name,
								version: ext.data.version
							},
							useCount: 1
						} )
					} else {
						_.findWhere( app.usedExtensions, {"id": ext.id} ).useCount++;
					}

				}

				/**
				 * Add a missing visualization extension to app.missingExtension.
				 * Furthermore adds the missing extension to $scope.missingExtensions
				 *
				 * Added object
				 *
				 * ```js
				 * {
				 * 	type: 'my-extension',
				 * 	missingCount: 1
				 * }
				 * ```
				 *
				 * `missingCount` indicates how often the extension was used in the app.
				 *
				 * @param app
				 * @param extType
				 */
				function addMissingExtension ( app, extType ) {

					//console.log( 'addMissingExtension > findWhere', _.findWhere( app.missingExtensions, {type: extType} ) );

					// we only know the id/type of the extension, so that's all we can add
					if ( !_.findWhere( app.missingExtensions, {type: extType} ) ) {
						app.missingExtensions.push( {type: extType, missingCount: 1} );
					} else {
						_.findWhere( app.missingExtensions, {type: extType} ).missingCount++;
					}

					if ( _.indexOf( $scope.missingExtensions, extType ) === -1 ) {
						$scope.missingExtensions.push( extType );
					}

				}

				/**
				 * Helper to return whether we deal with a native object or a custom visualization extension.
				 * @param obj
				 * @returns {boolean}
				 */
				function isNativeObject ( obj ) {

					var nativeObjects = [
						'barchart',
						'combochart',
						'filterpane',
						'gauge',
						'linechart',
						'kpi',
						'map',
						'piechart',
						'scatterplot',
						'table',
						'text-image',
						'treemap',
						'pivot-table'
					];

					return _.indexOf( nativeObjects, obj.type ) > -1;
				}

				/**
				 * "Store" inspected apps to the local scope.
				 * @param apps
				 * @returns {*|promise}
				 */
				function saveInspectedApps ( apps ) {

					console.info( 'save inspected apps' );

					var deferred = $q.defer();
					$scope.apps = apps;
					deferred.resolve( apps );
					return deferred.promise;
				}

				//function destroyAppSessions( apps ) {
				//
				//	var deferred = $q.defer();
				//
				//
				//
				//	return deferred.promise;
				//
				//}

				// ****************************************************************************************
				// Some silly UI stuff
				// ****************************************************************************************
				$scope.selectedTab = 'installed';
				$scope.selectTab = function ( tab ) {
					$scope.selectedTab = tab;
				};
				$scope.openApp = function ( qDocId ) {
					location.href = '/sense/app/' + encodeURIComponent( qDocId );
				};

				// ****************************************************************************************
				// Initialization
				// ****************************************************************************************
				$scope.init();

			}
			]
		};
	} )
;
