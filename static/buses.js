var underscore = _.noConflict();

// The list of all the routes, and the current selected route.
// Route properties:
/*
	Id	 : 19
	Name : "19: Bull Creek"
*/
var routes = null;
var selectedRoute = null;

// The list of all the active vehicles and their positions.
// Vehicle properties (items suffixed with * are added by this code):
/*
	Route         : 1 (raw form: "1")
	RouteName*    : 1: Metric/South Congress
	Direction     : N
	DirectionName*: North
	Updatetime    : Date{ 14:15:07 } (raw form: "14:15:07")
	Updateseconds : 51307
	Vehicleid     : 8934
	Block         : 001-03
	Adherance     : 0
	Adhchange     : S
	Reliable      : Y
	Offroute      : N
	Stopped       : Y
	Inservice     : L
	Frequency     : N
	Speed         : 0.00
	Heading       :  0
	Tripid        : 1474777
	Routeid       : 143000
	Signage       : 1-Metric/South Congress-NB
	Position      : { lat: 30.189377, lng: -97.767860 } (raw form: "30.189377,-97.767860")
*/ 
var vehicles = null;

// The user's last known location.
var userLocation = null;

// Loads the vehicle list from the web server
function refreshFromServer() {
	// Setup the information we need for querying.
	var busStatusUrl = location.origin + "/VehicleLocations";
	var ajaxData = {};
	if( document.location.search === "?cachedTestData" ) {
		ajaxData.cachedTestData = 1;
	}

	$.ajax({
		url: busStatusUrl,

		// Additional data for the query.	
		data: ajaxData,
		
		// Tell jQuery we're expecting JSONP.
		dataType: "jsonp",

		// Process the response.
		success: function( response ) {
			var package = response["soap:Envelope"]["soap:Body"].FleetlocationResponse;
			vehicles = package.Vehicles.Vehicle;
			augmentVehicleInfo();
			finishLoad();
		},
		
		// Handle errors.
		error: function( jqXHR, statusText, error ) {
			console.log( statusText );
		}
	});
}

$(document).ready( refreshFromServer );

// Get notified when the hash changes. We're using the hash to identify the 
// route of interest. If the hash is empty, that means we want to see the full
// list of routes.
$(window).on( "hashchange", function() {
	var route = parseInt( document.location.hash.substr( 1 ) );
	switchToRoute( route );
});

// Consumes the list of vehicles and sets up the route headers
function finishLoad() {
	// Find all the different routes.
	routes = underscore.map( vehicles, function( v ) { return { Id: parseInt( v.Route ), Name: v.RouteName }; } ); 
	routes = underscore.uniq( routes, false, function( r ) { return r.Id; } );
	routes = underscore.sortBy( routes, function( v ) { return v.Id; } );

	// Create a map from route id to associated header element.
	var idToDiv = {};
	$("#routes a.route").each( function( i, elem ) {
		var route = $(elem).data();
		idToDiv[route.Id] = $(elem);
	});

	// Create/update headers for all the routes.
	$.each( routes, function( i, r ) {
		if( r.Name === "" ) {
			return;
		}

		// Find or update the header for this route.
		var elem = idToDiv[r.Id];
		if( !elem ) {
			elem = $("<a/>").addClass( "route" ).attr( "href", "#" + r.Id );
			$("<span/>").text( r.Name ).appendTo( elem );
			$("<a/>").addClass( "refresh" ).addClass( "refresh-hide" )
				.attr( "href", "#" )
				.click( function( evt ) {
					evt.preventDefault(); // don't follow the link
					$(this).addClass( "refresh-animate" );
					$("#routes .route").addClass( "route-refreshing" );
					refreshFromServer();
				})
				.appendTo( elem )
				.append( $("<img/>").attr( "src", "refresh.png" ) );
			elem.appendTo( "#routes" );
		}
		else {
			elem.children( "span" ).text( r.Name );
		}
		elem.data( r );
	} );

	if( selectedRoute ) {
		refreshVehicles( selectedRoute );
	}
	else {
		// Pre-select the last used route.
		var last = localStorage.lastRoute;
		if( last ) {
			document.location.hash = "#" + last;
			switchToRoute( parseInt( last ) );
		}
	}

	$("#loading").css( "display", "none" );
	$("#content").css( "display", "block" );
	$("a.refresh").removeClass( "refresh-animate" );
	$("#routes .route").removeClass( "route-refreshing" );
}

// Switches to the specified route, or back to the full listing if wantRoute is NaN
function switchToRoute( routeId ) {
	var showAll = isNaN( routeId );
	
	// Some non-route-specific actions for switching.
	$("#buses").empty();
	if( showAll ) {
		selectedRoute = null;
		localStorage.removeItem( "lastRoute" );
	}
	else {
		selectedRoute = routeId;
		localStorage.lastRoute = routeId;
	}

	// Adjust each route header as appropriate.
	$(".route").each( function( i, elem ) {
		var e = $(elem);
		var thisRoute = e.data();

		// Make the switch...
		if( showAll ) {
			// Restore the regular per-route links and show the headers.
			e.attr( "href", "#" + thisRoute.Id );
			e.removeClass( "routeTopBar" );
			e.children( ".refresh" ).addClass( "refresh-hide" );
			e.show();
		}
		else if( routeId === thisRoute.Id ) {
			// Change this route's link to point to nothing (to collapse the header),
			// and show all the vehicles for this route.
			e.attr( "href", "#" );
			e.addClass( "routeTopBar" );
			e.children( ".refresh" ).removeClass( "refresh-hide" );
			refreshVehicles( thisRoute.Id );
		}
		else {
			// show some other route
			e.hide();
		}
	});

	// Scroll back to the top in case the user had to scroll down to find the
	// route they wanted to select.	
	window.scrollTo( 0, 0 );
}

// Refreshes the list of vehicles displayed for a given route.	
function refreshVehicles( routeId ) {
	// Decide what size to use for images.	
	var windowWidth = $(window).width();
	var imageWidth = (windowWidth <= 750)
		? (windowWidth - 20)
		: 350;
	var imageHeight = Math.floor( imageWidth * 3/4 );

	// Find the buses on this route and make a lookup table of the currently-shown ones.
	var buses = underscore.filter( vehicles, function( v ) { return v.Route === routeId; } );
	var currentById = {};
	$("#buses .busInfo").each( function( i, elem ) {
		var v = $(elem).data();
		currentById[v.Vehicleid] = { Elem: $(elem), Used: false };
	} );

	// Recompute the set of buses to display.
	$.each( buses, function( i, bus ) {
		// Setup the text we'll show for each bus.
		var header = bus.DirectionName ? bus.DirectionName : ("Bus " + bus.Vehicleid);
		var bearingInt = parseInt( bus.Heading ) * 10;
		var bearingStr = directionToText( bearingInt );
		var status = (bus.Speed > 1)
			? ("Heading " + bearingStr + " (" + bearingInt + "\u00B0) at " + Math.round( bus.Speed ) + " MPH")
			: "Stopped";
		var footer = "Data from " + moment( bus.Updatetime ).format( "h:mm:ss A" );

		// Create the URL for the bus position map.
		var pos = bus.Position;
		var zoom = 15;
		var mapUrl = "https://maps.googleapis.com/maps/api/staticmap?";
		mapUrl += "key=AIzaSyCj73tIFXQfTsVWD83JQnMUho1PZa_YOLA";
		mapUrl += "&center=" + pos.lat + "," + pos.lng;
		mapUrl += "&zoom=" + zoom;
		mapUrl += "&size=" + imageWidth + "x" + imageHeight;
		mapUrl += "&scale=2";
		mapUrl += "&markers=color:red%7C" + pos.lat + "," + pos.lng;
		var fullUrl = "http://maps.google.com/maps?";
		fullUrl += "&z=" + zoom;
		fullUrl += "&q=" + pos.lat + "+" + pos.lng;
		fullUrl += "&ll=" + pos.lat + "+" + pos.lng;

		// Find or crete the div element for this bus.
		var existing = currentById[bus.Vehicleid];
		if( existing ) {
			existing.Used = true;
		}
		var elem = existing ? existing.Elem : null;
		if( !elem ) {
			elem = $("<div/>").addClass( "busInfo" );
			$("<p/>").addClass( "busHeader" ).appendTo( elem );
			$("<p/>").addClass( "busStatus" ).appendTo( elem );
			$("<p/>").addClass( "busFooter" ).appendTo( elem );
			var link = $("<a/>").addClass( "busMapLink" ).appendTo( elem );
			$("<img/>")
				.addClass( "busMap" )
				.attr( "width", imageWidth )
				.attr( "height", imageHeight )
				.appendTo( link );
			elem.appendTo( "#buses" );
		}

		// Update all the information for this guy.
		elem.data( bus );
		elem.children( "p.busHeader" ).text( header ).data( "original", header );
		elem.children( "p.busStatus" ).text( status );
		elem.children( "p.busFooter" ).text( footer );
		elem.children( "a.busMapLink" ).attr( "href", fullUrl )
		    .children( "img" ).attr( "src", mapUrl ).attr( "title", "Vehicle " + bus.Vehicleid );

		// Mark stale data so the user is more likely to see it		
		var stale = moment( bus.Updatetime ) < moment().subtract( 10, 'minutes' );
		elem.children( ".busFooter" ).toggleClass( "staleData", stale );
	} );

	// Remove any vehicles which are no longer on the route.
	$.each( currentById, function( existing ) {
		if( !currentById[existing].Used ) {
			currentById[existing].Elem.remove();
		}
	} );

	// Load the proximity info and sort if needed.
	if( userLocation != null ) {
		sortByProximity();
	}
	else if( navigator.geolocation && !userLocation ) {
		navigator.geolocation.getCurrentPosition( function( loc ) {
			userLocation = loc;
			sortByProximity();
		} );
	}
}

// Sorts the bus information by proximity to the user.	
function sortByProximity() {
	if( !userLocation.coords.accuracy ) {
		return;
	}

	$(".busInfo").each( function( i, elem ) {
		var v = $(elem).data();

		// Compute the actual great circle distance.
		var distance = computeDistance( v.Position.lat, v.Position.lng,
			userLocation.coords.latitude, userLocation.coords.longitude );
		v.Distance = distance;

		// Add the distance to each item's header.
		var header = $(elem).children( ".busHeader" );
		var text = header.data( "original" );
		text += ": " + Math.round( distance * 10 ) / 10 + " miles";
		header.text( text );
	});

	// Pull out each item and its distance.
	var buses = underscore.map( $(".busInfo"), function( elem ) {
		return { elem: elem, distance: $(elem).data().Distance };
	} );
	if( buses.length === 0 ) {
		return;
	}

	// Sort the buses by their distance to the user.
	buses = underscore.sortBy( buses, function( b ) { return b.distance; } );
	var next = $(buses[0].elem);
	for( i = 1; i < buses.length; ++i ) {
		$(buses[i].elem).insertAfter( next );
		next = $(buses[i].elem); 
	}
}

// Adds computed vehicle properties which are not in the raw JSON data.
function augmentVehicleInfo() {
	var routePattern = /\d+(-| )?([\w /]+)(-\w+)?/;
	$.each( vehicles, function( i, v ) {
		// Convert some values to proper non-string types.
		v.Route = parseInt( v.Route );
		v.Position = parseLocation( v.Position );	
		v.Updatetime = parseTime( v.Updatetime );

		// Compute the route name.
		var m = routePattern.exec( v.Signage );
		if( m ) {
			v.RouteName = v.Route + ": " + m[2];
		}
		else {
			v.RouteName = v.Signage;
		}

		// Compute a friendly direction name.
		var dir;
		switch( v.Direction )
		{
			case "N": dir = "Northbound"; break;
			case "S": dir = "Southbound"; break;
			case "E": dir = "Eastbound"; break;
			case "W": dir = "Westbound"; break;
			case "C": dir = null; break; // clockwise?
			case "K": dir = null; break; // counter-clockwise?
			case "I": dir = "Inbound"; break;
			case "O": dir = "Outbound"; break;
		}
		v.DirectionName = dir;
	} );
}

// Computes approximate distance between two nearby lat/lon points.
function computeDistance( lat1, lon1, lat2, lon2 ) {
	var degreeToSM = 60 * 1.15078; // 60 NM * (NM->SM factor)
	var dlat = Math.abs( lat1 - lat2 ) * degreeToSM;
	var dlon = Math.abs( lon1 - lon2 ) * degreeToSM * Math.cos( lat1 * Math.PI / 180 );
	return Math.sqrt( dlat * dlat, dlon * dlon );
}

// Converts a location string (e.g. "1.234,-5.678") to a Google Maps location object 
function parseLocation( locationStr ) {
	var parts = locationStr.split( "," );
	var lat = parseFloat( parts[0] );
	var lon = parseFloat( parts[1] );
	return { lat: lat, lng: lon };
}

// Parses a time value (hh:mm:ss) and returns a Date object (assumes the time is today).
// This function assumes the input value is in the past, and will never return a value
// in the future.
function parseTime( dateStr ) {
	var now = new Date();

	var pattern = /(\d+):(\d+):(\d+)/;
	var m = pattern.exec( dateStr );

	// Make a date with the assumption that the time value occurred today.
	var value = new Date( now.getFullYear(), now.getMonth(), now.getDate(), m[1], m[2], m[3] );

	// If the time value is in the future, then we'll assume it's from yesterday. The
	// likely scenario is that the time value is something like 23:59 and several minutes
	// have passed, so it's now 00:01 on the next day.
	if( value > now ) {
		value = moment( value ).subtract( 1, "day" ).toDate();
	}
	return value;
}

// Converts a value between 0 and 360 to textual form, e.g. "NW"
function directionToText( hdg ) {
	var half = 45 / 2;
	if( hdg > (360 - half) || hdg <= (0 + half) ) {
		return "North";
	}
	else if( hdg > (0 + half) && hdg <= (90 - half) ) {
		return "Northeast";
	}
	else if( hdg > (90 - half) && hdg <= (90 + half) ) {
		return "East";
	}
	else if( hdg > (90 + half) && hdg <= (180 - half) ) {
		return "Southeast";
	}
	else if( hdg > (180 - half) && hdg <= (180 + half) ) {
		return "South";
	}
	else if( hdg > (180 + half) && hdg <= (270 - half) ) {
		return "Southwest";
	}
	else if( hdg > (270 - half) && hdg <= (270 + half) ) {
		return "West";
	}
	else {
		return "Northwest";
	}
}
