/* City and place labels for the hodograph map: drawn as HTML so they get a clean halo and zoom-based priority.
 * [name, lat, lon, tier] tier 1 = shows first (zoom 3+), 2 = zoom 5+, 3 = zoom 6+. */
window.HodoCities = {
  cities: [
    ['New York', 40.71, -74.01, 1], ['Los Angeles', 34.05, -118.24, 1], ['Chicago', 41.88, -87.63, 1], ['Houston', 29.76, -95.37, 1], ['Dallas', 32.78, -96.8, 1],
    ['Atlanta', 33.75, -84.39, 1], ['Miami', 25.76, -80.19, 1], ['Seattle', 47.61, -122.33, 1], ['Denver', 39.74, -104.99, 1], ['Phoenix', 33.45, -112.07, 1],
    ['Minneapolis', 44.98, -93.27, 1], ['Washington', 38.91, -77.04, 1], ['Boston', 42.36, -71.06, 1], ['San Francisco', 37.77, -122.42, 1], ['Toronto', 43.65, -79.38, 1],
    ['Mexico City', 19.43, -99.13, 1], ['Montreal', 45.5, -73.57, 1], ['Vancouver', 49.28, -123.12, 1], ['Kansas City', 39.1, -94.58, 1], ['New Orleans', 29.95, -90.07, 1],
    ['Oklahoma City', 35.47, -97.52, 2], ['St. Louis', 38.63, -90.2, 2], ['Detroit', 42.33, -83.05, 2], ['Philadelphia', 39.95, -75.17, 2], ['Salt Lake City', 40.76, -111.89, 2],
    ['Las Vegas', 36.17, -115.14, 2], ['Portland', 45.52, -122.68, 2], ['San Antonio', 29.42, -98.49, 2], ['Nashville', 36.16, -86.78, 2], ['Charlotte', 35.23, -80.84, 2],
    ['Louisville', 38.25, -85.76, 2], ['Memphis', 35.15, -90.05, 2], ['Omaha', 41.26, -95.93, 2], ['Albuquerque', 35.08, -106.65, 2], ['Cleveland', 41.5, -81.69, 2],
    ['Pittsburgh', 40.44, -80.0, 2], ['Indianapolis', 39.77, -86.16, 2], ['Tampa', 27.95, -82.46, 2], ['Orlando', 28.54, -81.38, 2], ['Calgary', 51.05, -114.07, 2],
    ['Edmonton', 53.55, -113.49, 2], ['Winnipeg', 49.9, -97.14, 2], ['Ottawa', 45.42, -75.7, 2], ['Monterrey', 25.69, -100.32, 2], ['Havana', 23.11, -82.37, 2],
    ['Little Rock', 34.75, -92.29, 3], ['Wichita', 37.69, -97.34, 3], ['Tulsa', 36.15, -95.99, 3], ['Des Moines', 41.59, -93.62, 3], ['Milwaukee', 43.04, -87.91, 3],
    ['Cincinnati', 39.1, -84.51, 3], ['Columbus', 39.96, -83.0, 3], ['Birmingham', 33.52, -86.8, 3], ['Jackson', 32.3, -90.18, 3], ['Jacksonville', 30.33, -81.66, 3],
    ['Raleigh', 35.78, -78.64, 3], ['Richmond', 37.54, -77.44, 3], ['Baltimore', 39.29, -76.61, 3], ['Buffalo', 42.89, -78.88, 3], ['Albany', 42.65, -73.76, 3],
    ['Hartford', 41.76, -72.69, 3], ['Charleston', 32.78, -79.93, 3], ['Savannah', 32.08, -81.09, 3], ['Mobile', 30.69, -88.04, 3], ['Baton Rouge', 30.45, -91.19, 3],
    ['Lubbock', 33.58, -101.86, 3], ['Amarillo', 35.22, -101.83, 3], ['El Paso', 31.76, -106.49, 3], ['Austin', 30.27, -97.74, 3], ['Corpus Christi', 27.8, -97.4, 3],
    ['Lincoln', 40.81, -96.7, 3], ['Sioux Falls', 43.55, -96.73, 3], ['Fargo', 46.88, -96.79, 3], ['Billings', 45.78, -108.5, 3], ['Boise', 43.62, -116.2, 3],
    ['Spokane', 47.66, -117.43, 3], ['Reno', 39.53, -119.81, 3], ['Sacramento', 38.58, -121.49, 3], ['San Diego', 32.72, -117.16, 3], ['Tucson', 32.22, -110.97, 3],
    ['Cheyenne', 41.14, -104.82, 3], ['Rapid City', 44.08, -103.23, 3], ['Green Bay', 44.51, -88.02, 3], ['Knoxville', 35.96, -83.92, 3], ['Lexington', 38.04, -84.5, 3],
    ['Anchorage', 61.22, -149.9, 2], ['Honolulu', 21.31, -157.86, 2], ['Regina', 50.45, -104.62, 3], ['Saskatoon', 52.13, -106.67, 3], ['Quebec', 46.81, -71.21, 3],
    ['Halifax', 44.65, -63.58, 3], ['Guadalajara', 20.66, -103.35, 3], ['Chihuahua', 28.63, -106.07, 3], ['Nassau', 25.05, -77.35, 3]
  ],
  areas: []
};
