package CapMetroProxy

import (
	"io"
    "fmt"
    "net/http"
	"google.golang.org/appengine"
	"google.golang.org/appengine/urlfetch"
)

func init() {
    http.HandleFunc("/VehicleLocations", getLocations)
    http.HandleFunc("/Test", test)
}

func test(w http.ResponseWriter, r *http.Request) {
	callback, _ := r.URL.Query()["callback"]

	fmt.Fprintf(w, "%v", len(callback))
	fmt.Fprint(w, "(")
	fmt.Fprint(w, ")")
}

func getLocations(w http.ResponseWriter, r *http.Request) {
	// Setup the app engine context and URL fetch object
	ctx := appengine.NewContext(r)
	client := urlfetch.Client(ctx)

	// Get the latest bus locations
	resp, err := client.Get("https://data.texas.gov/api/file_data/72fa25ef-d5a9-4fe8-8ef8-32e48f50e850")
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

	fmt.Fprintf(w, callback)
	fmt.Fprint(w, "(")
	io.Copy(w, resp.Body)
	fmt.Fprint(w, ")")
}
