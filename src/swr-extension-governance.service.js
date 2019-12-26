/*global define*/
define( [
		'underscore',
		'angular',
		'qvangular',
		'qlik',
		'ng!$q'
	],
	function ( _,
			   angular,
			   qvangular,
			   qlik,
			   $q ) {
		'use strict';

		qvangular.service( "swrExtensionGovernanceService", ['$timeout', function ( $timeout ) {
			var vm = {};

			var init = function () {
				vm.loadingStatusHint = '';
				vm.apps = [];
				vm.isLoading = false;
				vm.missingExtensions = [];

				//qlik.setOnError( function ( error ) {
				//	//window.console.error( error );
				//} );

				// First get the list of installed extensions, then we can match them
				// later on with the used ones ...
				getExtensions()
					.then( setLoadingStatus.bind( null, true ) )
					.then( getApps )
					.then( saveInspectedApps )
					.then( traverseApps )
					.then( saveInspectedApps )
					.then( analyzeExtensionUsage )
					.then( setLoadingStatus.bind( null, false ) )
					.then( function () {
						//console.info( 'apps', vm.apps );
						//console.info( 'installedExtensions', vm.installedExtensions );
						angular.noop(); // console.* will be removed in production, so have something inside the function.
					} );

			};

			function setLoadingStatus ( isLoading ) {
				var deferred = $q.defer();
				$timeout( function () {
					vm.isLoading = isLoading;
					if ( !isLoading ) { vm.loadingStatusHint = '';}
					deferred.resolve( isLoading );
				}, 0 );
				return deferred.promise;
			}

			function endsWith(str, suffix) {
				return str.indexOf(suffix, str.length - suffix.length) !== -1;
			}

			/**
			 * Get a list of installed extensions.
			 * @returns {*|promise}
			 */
			function getExtensions () {

				vm.loadingStatusHint = 'Loading extensions ...';

				var defer = $q.defer();
				qlik.getExtensionList( function ( extensions ) {

						// Filter to only visualization extensions, because we'll also get mashups, visualization-templates and mashup-templates
						// There is a bug in 2.1.1 which returns all extensions of type "visualization" as "template", therefore don't do it.
						var onlyVizExtensions = _.filter( extensions, function ( item ) {
							return item.data.type === 'visualization' || !endsWith(item.id, '-template');
						} );

						_.map( onlyVizExtensions, function ( viz ) {
							viz.usedIn = [];
						} );
						vm.installedExtensions = onlyVizExtensions;
						defer.resolve( onlyVizExtensions );
					}
				);
				return defer.promise;
			}

			/**
			 * Retrieve a list of all apps from the engine.
			 * @returns {*|promise}
			 */
			function getApps () {

				vm.loadingStatusHint = 'Loading apps ... ';

				var deferred = $q.defer();
				qlik.getAppList( function ( apps ) {
					deferred.resolve( apps );
				} );
				return deferred.promise;
			}

			/**
			 * "Store" inspected apps to the local scope.
			 * @param apps
			 * @returns {*|promise}
			 */
			function saveInspectedApps ( apps ) {
				var deferred = $q.defer();
				vm.apps = apps;
				deferred.resolve( apps );
				return deferred.promise;
			}

			/**
			 * Process each app:
			 * - Save the app's meta data to vm.apps
			 * @param apps
			 */
			function traverseApps ( apps ) {

				vm.loadingStatusHint = 'Analyzing apps ...';

				return $q.all( apps.map( function ( app ) {

					var deferred = $q.defer();
					processApp( app )
						.then( function ( processedApp ) {
							//console.log( '--app processed => ', processedApp );
							vm.loadingStatusHint = 'Analyzing \"' + processedApp.qDocName + '\"';
							app.missingExtensions = []; 	// Initialize the array
							app.usedExtensions = []; 		// Initialize the array
							deferred.resolve( app );
						}, function ( err ) {
							//console.error( 'Error in processApp', err );
							deferred.reject( /*reply*/ );
						} );

					return deferred.promise;
				} ) );
			}

			function isCurrentApp( appData ) {
				if (appData.qDocId.indexOf('.qvf') > -1) {
					return (appData.qDocId.replace( '.qvf', '' ) !== qlik.currApp().id);
				} else {
					return appData.qDocId === qlik.currApp().id;
				}
			}

			/**
			 * Process a single app:
			 * - open the app
			 * - Get all sheet objects
			 * @param appData
			 * @returns {*|promise}
			 */
			function processApp ( appData ) {
				var defer = $q.defer();

				//console.log( '>> processApp >> app.qDocId', app.qDocId );
				//console.log( '>> processApp >> qlik', qlik );
				//console.log( 'qlik.currApp().id', qlik.currApp().id );

				var currApp;
				appData.isCurrentApp = isCurrentApp( appData );
				if ( appData.isCurrentApp ) {
					currApp = qlik.openApp( appData.qDocId, {openWithoutData: true} );
				} else {
					currApp = qlik.currApp();
				}
				currApp.getAppObjectList( 'sheet', function ( reply ) {
					appData.qAppObjectList = reply.qAppObjectList;
					currApp.destroySessionObject( reply.qInfo.qId )
						.then( function () {
							if ( !appData.isCurrentApp ) {
								try {
									currApp.close();
								}
								catch ( err) { /*eat it*/}
								defer.resolve( appData );
							} else {
								defer.resolve( appData );
							}
						}, function ( err ) {
							defer.reject( err );
						} );
				} );
				return defer.promise;
			}

			/**
			 * Append to the list of visualization extensions where they are used.
			 * @return {*|promise}
			 */
			function analyzeExtensionUsage () {

				vm.loadingStatusHint = 'Analyze extension usage ... ';

				var deferred = $q.defer();

				_.map( vm.apps, function ( app ) {
					if ( app.qAppObjectList && app.qAppObjectList.qItems ) {
						_.map( app.qAppObjectList.qItems, function ( sheet ) {
							_.map( sheet.qData.cells, function ( object ) {
								if ( !isNativeObject( object ) ) {
									//console.log( 'ext to search for', object );

									var installedExt = _.findWhere( vm.installedExtensions, {id: object.type} );
									//console.log( 'masterExtension: >> ', masterExtension );

									// Extension is found, so add the usage to the extensions
									if ( installedExt ) {
										// Todo: can probably be optimized into one ...
										// Todo: Add also usage in stories
										addExtensionUsage( installedExt, app, sheet );
										addUsedExtension( app, installedExt, sheet );
									} else {
										// Extension is not found
										addMissingExtension( app, object.type, sheet );
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
			 *
			 * @param ext
			 * @param app
			 */
			function addExtensionUsage ( ext, app, sheet ) {

				var appMeta = getAppMeta( app );

				if ( !_.findWhere( ext.usedIn, {qDocId: appMeta.qDocId} ) ) {
					ext.usedIn.push( appMeta );
				} else {
					// Increase the usage count
					_.findWhere( ext.usedIn, {qDocId: app.qDocId} ).useCount++;
				}

				// Add the sheet
				if ( !_.findWhere( _.findWhere( ext.usedIn, {qDocId: app.qDocId} ).sheetsUsed, {qId: sheet.qInfo.qId} ) ) {
					var sheetMeta = getSheetMeta( sheet );
					_.findWhere( ext.usedIn, {qDocId: app.qDocId} ).sheetsUsed.push( sheetMeta );
				}
			}

			/**
			 * Return some needed meta-data for an app.
			 * @param app
			 * @returns {{qDocId: (string), qTitle: (string), qDocName: (string), qMeta: *, useCount: number, sheetsUsed: Array}}
			 */
			function getAppMeta ( app ) {
				return {
					qDocId: app.qDocId,
					qTitle: app.qTitle,
					qDocName: app.qDocName,
					qMeta: app.qMeta,
					useCount: 1,
					sheetsUsed: []
				}
			}

			/**
			 * Return some needed meta-data for a sheet.
			 * @param sheet
			 * @returns {{qId: (string), title: (string)}}
			 */
			function getSheetMeta ( sheet ) {
				return {
					qId: sheet.qInfo.qId,
					title: sheet.qMeta.title,
					usageCount: 1
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
			function addUsedExtension ( app, ext, sheet ) {

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
						useCount: 1,
						usedInSheets: []
					} )
				} else {
					_.findWhere( app.usedExtensions, {"id": ext.id} ).useCount++;
				}

				// Used in which sheets
				if ( !_.findWhere( _.findWhere( app.usedExtensions, {id: ext.id} ).usedInSheets, {qId: sheet.qInfo.qId} ) ) {
					var sh = {
						qId: sheet.qInfo.qId,
						title: sheet.qMeta.title
					};
					_.findWhere( app.usedExtensions, {id: ext.id} ).usedInSheets.push( sh );
				}

			}

			/**
			 * Add a missing visualization extension to app.missingExtension.
			 * Furthermore adds the missing extension to vm.missingExtensions
			 *
			 * Added object
			 *
			 * ```js
			 * {
				 * 	type: 'my-extension',
				 * 	missingCount: 1
				 * 	missingOnSheets: [
				 * 		{
				 * 		qId: 'sheetId',
				 * 		title: 'Sheet title'
				 * 		}
				 * 	]
				 * }
			 * ```
			 *
			 * `missingCount` indicates how often the extension was used in the app.
			 *
			 * @param app
			 * @param extType
			 */
			function addMissingExtension ( app, extType, sheet ) {

				// - in which apps, sheets,
				var missingExtension = _.findWhere( vm.missingExtensions, {type: extType} );
				if ( !missingExtension ) {
					missingExtension = {
						type: extType,
						apps: [],
						usageCount: 1
					};
					vm.missingExtensions.push( missingExtension );
				} else {
					missingExtension.usageCount++;
				}

				// Add the app
				if ( !_.findWhere( missingExtension.apps, {"qDocId": app.qDocId} ) ) {
					missingExtension.apps.push( getAppMeta( app ) );
				}

				// Add the sheet + usage
				var missingExtensionApp = _.findWhere( missingExtension.apps, {"qDocId": app.qDocId} );
				var missingExtensionAppSheet = _.findWhere( missingExtensionApp, "sheetsUsed.qId", sheet.qInfo.qId );
				if ( !missingExtensionAppSheet ) {
					missingExtensionApp.sheetsUsed.push( getSheetMeta( sheet ) );
				} else {
					missingExtensionAppSheet.usageCount++;
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

			// ****************************************************************************************
			// Return
			// ****************************************************************************************

			return {
				init: init,
				vm: vm
			}
		}] );
	} );
