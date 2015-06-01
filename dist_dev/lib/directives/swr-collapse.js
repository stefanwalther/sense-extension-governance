/*global define*/
define( [
	'qvangular'
], function ( qvangular ) {
	'use strict';

	qvangular.directive( 'swrCollapse', function () {
		return {
			restrict: 'EA',
			link: function ( scope, element, attrs ) {
				scope.isCollapsed = true;
				scope.toggleCollapse = function () {
					scope.isCollapsed = !scope.isCollapsed;
				}
			}
		}
	} );

} );