var underscore = _.noConflict();

// The list of all the active vehicles and their positions.
var vehicles = null;

// The user's last known location.
var userLocation = null;

// Load the bus list from the web server
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
		console.log( package ); // server response
		vehicles = package.Vehicles.Vehicle;
		finishLoad();
	},
	
	// Handle errors.
	error: function( jqXHR, statusText, error ) {
		console.log( statusText );
	}
});

// Get notified when the hash changes. We're using the hash to identify the 
// route of interest. If the hash is empty, that means we want to see the full
// list of routes.
$(window).on( "hashchange", function() {
	var route = parseInt( document.location.hash.substr( 1 ) );
	switchToRoute( route );
});

// Consumes the list of vehicles and sets up the route headers
function finishLoad() {
	augmentVehicleInfo();

	// Find all the different routes
	var routes = underscore.map( vehicles, function( v ) { return { Id: parseInt( v.Route ), Name: v.RouteName }; } ); 
	routes = underscore.uniq( routes, false, function( r ) { return r.Id; } );
	routes = underscore.sortBy( routes, function( v ) { return v.Id; } );

	// Add a header for each route
	$.each( routes, function( i, r ) {
		if( r.Name === "" ) {
			return;
		}

		var elem = $("<a/>").addClass( "route" ).attr( "href", "#" + r.Id );
		$("<span/>").text( r.Name ).appendTo( elem );
		$("<div/>").addClass( "buses" ).appendTo( elem ); // bus storage
		elem.data( r );
		elem.appendTo( "#routes" );
	} );

	// Pre-select the last used route.
	var last = localStorage.lastRoute;
	if( last ) {
		document.location.hash = "#" + last;
		switchToRoute( parseInt( last ) );
	}

	$("#loading").css("display", "none")
	$("#content").css("display", "block")
}

// Adds computed vehicle properties which are not in the raw JSON data.
//
// Vehicle info (items suffixed with *) are added by this code):
/*
	Route         : 1
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
function augmentVehicleInfo() {
	// Parse the positions out into structured form
	$.each( vehicles, function( i, v ) {
		v.Position = parseLocation( v.Position );	
	} );
	
	// Parse the update times into structured form
	$.each( vehicles, function( i, v ) {
		v.Updatetime = parseTime( v.Updatetime );
	} );
	
	// Add a RouteName property, which is really a reformatted version of Signage
	var routePattern = /\d+(-| )?([\w /]+)(-\w+)?/;
	$.each( vehicles, function( i, v ) {
		var m = routePattern.exec( v.Signage );
		if( !m ) {
			v.RouteName = v.Signage;
			return; 
		}

		v.RouteName = v.Route + ": " + m[2];
	} );

	// Add a DirectionName property.
	$.each( vehicles, function( i, v ) {
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

// Switches to the specified route, or back to the full listing if wantRoute is NaN
function switchToRoute( wantRoute ) {
	var showAll = isNaN( wantRoute );
	
	// Some non-route-specific actions for going back to the full listing
	if( showAll ) {
		$("#buses").empty();
		localStorage.removeItem( "lastRoute" );
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
			e.show();
		}
		else if( wantRoute === thisRoute.Id ) {
			// Change this route's link to point to nothing (to collapse the header),
			// and show all the vehicles for this route.
			e.attr( "href", "#" );
			e.addClass( "routeTopBar" );
			showVehicles( thisRoute );
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

// Switches the display to show a particular route	
function showVehicles( route ) {
	// Remember this for the next load.		
	localStorage.lastRoute = route.Id;

	// Decide what size to use for images.	
	var windowWidth = $(window).width();
	var imageWidth = (windowWidth <= 750)
		? (windowWidth - 20)
		: 350;
	var imageHeight = Math.floor( imageWidth * 3/4 );

	// Recompute the set of buses to display.
	var buses = $("#buses");
	buses.empty();
	$.each( vehicles, function( i, v ) {
		if( v.RouteName !== route.Name ) {
			return;
		}

		// Setup the text we'll show for each bus.
		var header = v.DirectionName ? v.DirectionName : ("Bus " + v.Vehicleid);
		var bearingInt = parseInt( v.Heading ) * 10;
		var bearingStr = directionToText( bearingInt );
		var status = (v.Speed > 1)
			? ("Heading " + bearingStr + " (" + bearingInt + "\u00B0) at " + Math.round( v.Speed ) + " MPH")
			: "Stopped";
		var footer = "Last updated at " + moment( v.Updatetime ).format( "h:mm:ss A" );

		// Create the URL for the bus position map.
		var pos = v.Position;
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

		// Add all the content to the display area, and attach the vehicle to the outer div.
		var elem = $("<div/>").addClass( "vehicleInfo" ).data( v );
		$("<p/>").addClass( "busHeader" ).text( header ).appendTo( elem );
		$("<p/>").addClass( "busStatus" ).text( status ).appendTo( elem );
		$("<p/>").addClass( "busFooter" ).text( footer ).appendTo( elem );
		var link = $("<a/>").attr( "href", fullUrl ).appendTo( elem );
		$("<img/>")
			.addClass( "busMap" )
			.attr( "src", mapUrl )
			.attr( "width", imageWidth )
			.attr( "height", imageHeight )
			.appendTo( link );
		elem.appendTo( buses );

		// Mark stale data so the user is more likely to see it		
		if( moment( v.Updatetime ) < moment().subtract( 10, 'minutes' ) ) {
			elem.children( ".busFooter" ).addClass( "staleData" );
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

	$(".vehicleInfo").each( function( i, elem ) {
		var v = $(elem).data();
		if( v.Distance ) {
			return;
		}

		// Compute the actual great circle distance.
		var distance = computeDistance( v.Position.lat, v.Position.lng,
			userLocation.coords.latitude, userLocation.coords.longitude );
		v.Distance = distance;

		// Add the distance to each item's header.
		var header = $(elem).children().first();
		var text = header.text();
		text += ": " + Math.round( distance * 10 ) / 10 + " miles";
		header.text( text );
	});

	// Pull out each item and its distance.
	var buses = underscore.map( $(".vehicleInfo"), function( elem ) {
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
