/*global define*/
define( [
		'qvangular',
		'./properties',
		'./initialproperties',
		'./lib/js/extUtils',
		'text!./lib/css/main.css',
		'text!./lib/partials/main.ng.html',

		// services
		'./swr-extension-governance.service',

		// components
		'./lib/components/eui-note/eui-note',
		'./lib/components/eui-collapse/eui-collapse',
		'./lib/components/eui-tooltip/eui-tooltip',
		'./lib/components/eui-tablesort/eui-tablesort'

	],
	function ( qvangular, props, initProps, extensionUtils, cssContent, ngTemplate ) {
		'use strict';

		extensionUtils.addStyleToHeader( cssContent, 'swr_extension_governance' );
		var egService = qvangular.getService( 'swrExtensionGovernanceService' );
		egService.init();

		return {

			definition: props,
			initialProperties: initProps,
			snapshot: {canTakeSnapshot: true},
			template: ngTemplate,
			controller: ['$scope', function ( $scope ) {

				$scope.vm = egService.vm;

				// ****************************************************************************************
				// Some UI stuff
				// ****************************************************************************************
				$scope.selectedTab = 'installed';
				$scope.selectTab = function ( tab ) {
					$scope.selectedTab = tab;
				};
				$scope.openApp = function ( qDocId ) {
					location.href = '/sense/app/' + encodeURIComponent( qDocId ); //Todo: fix for virtual proxy
				};
				$scope.getSheetUsedTitle = function ( sheetsUsed ) {
					var titleArray = sheetsUsed.map( function ( sheet ) {
						return sheet.title;
					} );
					var r = '<ul style="margin-left:15px;margin-bottom:15px;">'; //Todo: Move style to CSS file
					titleArray.forEach( function ( item ) {
						r += '<li>' + item + '</li>';
					} );
					r += '</ul>';
					return r;
				};

				$scope.extensionsWithMissing = function () {
					var appWithMissing = 0;
					$scope.vm.apps.forEach( function ( app ) {
						if (app.missingExtensions.length > 0) {
							appWithMissing++;
						}
					});
					return appWithMissing;
				};

				//$scope.installedFilter = function ( item ) {
				//	console.log('item', item);
				//	console.log('resultsFilter', $scope.resultsFilter);
				//	return item;
				//};

			}]
		};
	} );
