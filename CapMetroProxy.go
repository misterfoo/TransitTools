package CapMetroProxy

import (
	"bytes"
    "fmt"
    "net/http"
	"google.golang.org/appengine"
	"google.golang.org/appengine/datastore"
	"google.golang.org/appengine/log"
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

// Caching data structure used by getLocations
type VehicleLocations struct {
	JsonData []byte
}

// Wraps a request for the CapMetro VehLoc.json file so that it can be used with JSONP.
// Might not need this: https://github.com/luqmaan/Instabus/blob/master/src/js/requests.js
func getLocations(w http.ResponseWriter, r *http.Request) {

	ctx := appengine.NewContext(r)
	log.Infof(ctx, "Requested URL: %v", r.URL)

	// What callback function should we use?
	callback := ""
	if callbackParam, _ := r.URL.Query()["callback"]; len(callbackParam) == 1 {
		callback = callbackParam[0]
	} else {
		http.Error(w, "Missing 'callback' parameter", http.StatusBadRequest)
		return
	}

	// Should we return cached test data?
	var wantCached bool;
	if _, ok := r.URL.Query()["cachedTestData"]; ok {
		wantCached = true;
	}

	var data []byte

	// Do we want to use cached data?
	var cacheKey *datastore.Key
	if wantCached {
		log.Infof(ctx, "Trying to use cached data...")
		cacheKey = datastore.NewKey(ctx, "VehicleLocations", "lastKnown", 0, nil)
		vlData := new(VehicleLocations)
		if err := datastore.Get(ctx, cacheKey, vlData); err == nil {
			data = vlData.JsonData
			log.Infof(ctx, "Got the data from the cache: %v bytes", len(data))
		}
	}

	// Do we still need to get the data?	
	if data == nil {
		log.Infof(ctx, "Getting the real data from CoA")

		// Get the latest bus locations
		client := urlfetch.Client(ctx)
		resp, err := client.Get("https://data.texas.gov/download/gyui-3zdd/text/plain")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Read the data and cache it if necessary		
		var b bytes.Buffer
		b.ReadFrom(resp.Body);
		data = b.Bytes();
		log.Infof(ctx, "Got %v bytes", len(data))

		// Cache this for later, if desired
		if wantCached {
			vlData := new(VehicleLocations)
			vlData.JsonData = data
			if _, err := datastore.Put(ctx, cacheKey, vlData); err != nil {
				log.Errorf(ctx, "Caching failed: %v", err)
			}
			log.Infof(ctx, "Cached the data for later")
		}
	}

	// Write the data back to the client, wrapped by a function call to the specified callback.
	fmt.Fprintf(w, callback)
	fmt.Fprint(w, "(")
	w.Write(data)
	fmt.Fprint(w, ")")
}
