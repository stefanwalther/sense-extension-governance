/*global define*/
define( [
	'jquery',
	'underscore'
], function ( $, _ ) {
	'use strict';

	return {

		/**
		 * Add a style to the document's header.
		 * @param cssContent {String} CSS content to be added to the header
		 * @param id {String} If id is passed, addStyleToHeader will check if there has already been added a style with the given id, if yes, the css content will not be added to the header again
		 */
		addStyleToHeader: function ( cssContent, id ) {
			if ( id && typeof id === 'string' ) {
				if ( !$( '#' + id ).length ) {
					$( "<style>" )
						.attr( 'id', id )
						.html( cssContent ).appendTo( "head" );
				}
			} else {
				$( "<style>" ).html( cssContent ).appendTo( "head" );
			}
		},

		/**
		 * Add as style link to the document's header
		 * @param {String} linkUrl Url to the CSS file
		 * @param {String}  id If an id is passed, the function will check if this style link has already been added or not.
		 * If yes, it will not be added again.
		 */
		addStyleLinkToHeader: function ( linkUrl, id ) {
			if ( id && !_.isEmpty( id ) ) {
				if ( !$( '#' + id ).length ) {
					var $styleLink = $( document.createElement( 'link' ) );
					$styleLink.attr( 'rel', 'stylesheet' );
					$styleLink.attr( 'type', 'text/css' );
					$styleLink.attr( 'href', linkUrl );
					if ( id && !_.isEmpty( id ) ) {
						$styleLink.attr( 'id', id );
					}
					$( 'head' ).append( $styleLink );
				}
			}
		}

	};

} );
