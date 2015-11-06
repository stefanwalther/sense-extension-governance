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

				qlik.setOnError( function ( error ) {
					//console.error( error );
				} );

				// First get the list of installed extensions, then we can match them
				// later on with the used ones ...
				getExtensions()
					.then( setLoadingStatus.bind( null, true ) )
					.then( getApps )
					.then( saveInspectedApps )
					.then( traverseApps )
					.then( saveInspectedApps )
					.then( analyzeExtensionUsage )
					//	//.then( closeSessionObjects )
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

			/**
			 * Get a list of installed extensions.
			 * @returns {*|promise}
			 */
			function getExtensions () {

				vm.loadingStatusHint = 'Loading extensions ...';

				var deferred = $q.defer();
				qlik.getExtensionList( function ( extensions ) {

						// Filter to only visualization extensions, because we'll also get mashups, visualization-templates and mashup-templates
						var onlyVizExtensions = _.filter( extensions, function ( item ) {
							return item.data.type === 'visualization';
						} );
						_.map( onlyVizExtensions, function ( viz ) {
							viz.usedIn = [];
						} );
						vm.installedExtensions = onlyVizExtensions;
						deferred.resolve( onlyVizExtensions );
					}
				);
				return deferred.promise;
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

				//console.info( 'traverseApps', '(' + apps.length + ')' );
				//console.log( 'traverseApps', apps );

				return $q.all( apps.map( function ( app ) {

					var deferred = $q.defer();
					//console.log( 'app', app );
					processApp( app )
						.then( function ( processedApp ) {
							//console.log( '--app processed', processedApp );
							vm.loadingStatusHint = 'Analyzing \"' + processedApp.qDocName + '\"';
							app.missingExtensions = []; 	// Initialize the array
							app.usedExtensions = []; 		// Initialize the array
							deferred.resolve( app );
						} )
						.catch( function ( reply ) {
							//console.error( 'Error in processApp', reply );
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

				//console.log( '>> processApp >> app.qDocId', app.qDocId );
				//console.log( '>> processApp >> qlik', qlik );
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
					//	}
					//	deferred.resolve( app );
					//}

				} else {
					currApp = qlik.currApp();
					isCurrentApp = true;
				}
				currApp.getAppObjectList( 'sheet', function ( reply ) {
					app.qAppObjectList = reply.qAppObjectList;
					//console.log( 'processApp >> getAppObjectList >> reply', reply );
					currApp.destroySessionObject( reply.qInfo.qId ).then( function () {
						if ( !isCurrentApp ) { currApp.close(); }
						def.resolve( app );
					} );
				} );

				return def.promise;
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
