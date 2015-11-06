/*global define*/
define( [
	'qvangular',
	'text!./eui-state-msg.ng.html'
], function ( qvangular, ngTemplate ) {
	'use strict';

	var component = {
		restrict: 'A',
		replace: false,
		template: ngTemplate,
		scope: {
			message: '@',
			state: '@'
		},
		controller: ['$scope', function ( $scope ) {
		}],
		link: function ( scope, elem, attrs ) {
			console.log( scope );
		}
	};

	qvangular.directive( "euiStateMsg", function () {
		return component;
	} );

	return component;

} );
