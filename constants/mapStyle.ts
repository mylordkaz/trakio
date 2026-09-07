// Google map styling is only applied when the Google provider renders the map.
export const SCHEMATIC_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f1f23' }] },
  { elementType: 'labels', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#232327' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2e2e34' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3a3a42' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#101013' }],
  },
] as const;
