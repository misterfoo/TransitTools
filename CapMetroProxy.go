package CapMetroProxy

import (
	"io"
    "fmt"
    "net/http"
	"google.golang.org/appengine"
	"google.golang.org/appengine/urlfetch"
)

// Initializes the server and sets up the handler functions.
func init() {
	http.HandleFunc("/", redirectIndex)
	http.HandleFunc("/VehicleLocations", getLocations)
}

// Redirects requests for the website root (http://wherever/) to the default landing page.
func redirectIndex(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/buses.html", http.StatusMovedPermanently)	
}

// Wraps a request for the CapMetro VehLoc.json file so that it can be used with JSONP.
// Might not need this: https://github.com/luqmaan/Instabus/blob/master/src/js/requests.js
func getLocations(w http.ResponseWriter, r *http.Request) {
	// Setup the app engine context and URL fetch object
	ctx := appengine.NewContext(r)
	client := urlfetch.Client(ctx)

	// Get the latest bus locations
	resp, err := client.Get("https://data.texas.gov/download/gyui-3zdd/text/plain")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// What callback function should we use?
	callback := ""
	if callbackParam, _ := r.URL.Query()["callback"]; len(callbackParam) == 1 {
		callback = callbackParam[0]
	} else {
		http.Error(w, "Missing 'callback' parameter", http.StatusBadRequest)
		return
	}

	// Write the data back to the client, wrapped by a function call to the specified callback.
	fmt.Fprintf(w, callback)
	fmt.Fprint(w, "(")
	io.Copy(w, resp.Body)
	fmt.Fprint(w, ")")
}
