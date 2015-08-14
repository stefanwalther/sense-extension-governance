/*global define*/
define( [], function () {
	'use strict';

	// ****************************************************************************************
	// Property Panel Definition
	// ****************************************************************************************

	// Appearance Panel
	var appearancePanel = {
		uses: "settings"
	};

	// Return values
	return {
		type: "items",
		component: "accordion",
		items: {
			appearance: appearancePanel
		}
	};

} );
