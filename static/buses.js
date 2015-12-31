var underscore = _.noConflict();

// The list of all the active vehicles and their positions.
var vehicles = null;

// The user's last known location.
var userLocation = null;

// Load the bus list from the web server
var busStatusUrl = location.origin + "/VehicleLocations";
$.ajax({
	url: busStatusUrl,
	
	// Tell jQuery we're expecting JSONP
	dataType: "jsonp",

	// Work with the response
	success: function( response ) {
		var package = response["soap:Envelope"]["soap:Body"].FleetlocationResponse;
		console.log( package ); // server response
		vehicles = package.Vehicles.Vehicle;
		finishLoad();
	},
	
	error: function( jqXHR, statusText, error ) {
		console.log( statusText );
	}
});

// Consumes the list of vehicles and fills the route picker
function finishLoad() {
	augmentVehicleInfo();

	// Find all the unique routes
	var routes = underscore.uniq( vehicles, false, function( v ) { return v.RouteName; } );
	routes = underscore.sortBy( routes, function( v ) { return parseInt( v.RouteName ); } );
	$.each( routes, function( i, v ) {
		if( v.Route === "" ) {
			return;
		}
		$("<option/>").text( v.RouteName ).attr( "value", v.RouteName ).appendTo( "#routesList" );
	} );

	// Pre-select the last used route.
	var last = localStorage.lastRoute;
	if( last ) {
		$("#routesList").val( last );
		showRoute( last );
	}

	$("#loading").css("display", "none")
	$("#content").css("display", "block")
}

// Adds computed vehicle properties which are not in the raw JSON data.
//
// Vehcile info (items suffixed with *) are added by this code):
/*
	Route         : 1
	RouteName*    : 1: Metric/South Congress
	Direction     : N
	DirectionName*: North
	Updatetime    : 14:15:07
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

// Converts a location string (e.g. "1.234,-5.678") to a Google Maps location object 
function parseLocation( locationStr ) {
	var parts = locationStr.split( "," );
	var lat = parseFloat( parts[0] );
	var lon = parseFloat( parts[1] );
	return { lat: lat, lng: lon };
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

// Switches the display to show a particular route	
function showRoute( routeName ) {

	// Remember this for the next load.		
	localStorage.lastRoute = routeName;

	// Recompute the set of buses to display.
	$("#buses").empty()
	$.each( vehicles, function( i, v ) {
		if( v.RouteName !== routeName ) {
			return;
		}

		// Setup the text we'll show for each bus.
		var header = v.DirectionName ? v.DirectionName : ("Bus " + v.Vehicleid);
		var bearingInt = parseInt( v.Heading ) * 10;
		var bearingStr = directionToText( bearingInt );
		var status = (v.Speed > 1)
			? ("Heading " + bearingStr + " (" + bearingInt + "\u00B0) at " + Math.round( v.Speed ) + " MPH")
			: "Stopped";
		var footer = "Vehicle " + v.Vehicleid + ", Updated: " + v.Updatetime;

		// Create the URL for the bus position map.
		var pos = v.Position;
		var zoom = 15;
		var mapUrl = "https://maps.googleapis.com/maps/api/staticmap?";
		mapUrl += "key=AIzaSyCj73tIFXQfTsVWD83JQnMUho1PZa_YOLA";
		mapUrl += "&center=" + pos.lat + "," + pos.lng;
		mapUrl += "&zoom=" + zoom;
		mapUrl += "&size=350x262";
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
			.attr( "width", "350" )
			.attr( "height", "262" )
			.appendTo( link );
		elem.appendTo( "#buses" );
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