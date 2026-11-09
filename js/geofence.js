// js/geofence.js - Definisi Titik Geofence Wilayah Kampus & Validasi

const CAMPUS_GEOFENCE_ZONES = [
    {
        id: 'rektorat',
        name: 'Wilayah Rektorat',
        shortName: 'Rektorat',
        center: [-6.73496, 108.53386],
        coordinates: [
            [-6.734705, 108.532951],
            [-6.734695, 108.533082],
            [-6.734657, 108.533213],
            [-6.734556, 108.533601],
            [-6.734515, 108.533732],
            [-6.734480, 108.533853],
            [-6.734408, 108.533961],
            [-6.734406, 108.534152],
            [-6.734436, 108.534189],
            [-6.734541, 108.534305],
            [-6.734541, 108.534429],
            [-6.734657, 108.534423],
            [-6.734785, 108.534405],
            [-6.734876, 108.534398],
            [-6.735123, 108.534393],
            [-6.735206, 108.534391],
            [-6.735440, 108.534378],
            [-6.735529, 108.534370],
            [-6.735540, 108.534051],
            [-6.735551, 108.533812],
            [-6.735572, 108.533707],
            [-6.735662, 108.533457],
            [-6.735683, 108.533387],
            [-6.735700, 108.532957],
            [-6.734735, 108.532954]
        ]
    },
    {
        id: 'siber',
        name: 'Wilayah Siber',
        shortName: 'Siber',
        center: [-6.737195, 108.53144],
        coordinates: [
            [-6.736946, 108.531021],
            [-6.736864, 108.531280],
            [-6.736851, 108.531387],
            [-6.736853, 108.531528],
            [-6.736861, 108.531615],
            [-6.736876, 108.531676],
            [-6.736920, 108.531740],
            [-6.737061, 108.531844],
            [-6.737173, 108.531897],
            [-6.737252, 108.531870],
            [-6.737324, 108.531866],
            [-6.737393, 108.531846],
            [-6.737439, 108.531811],
            [-6.737545, 108.531767],
            [-6.737511, 108.531642],
            [-6.737495, 108.531581],
            [-6.737461, 108.531466],
            [-6.737435, 108.531370],
            [-6.737423, 108.531209],
            [-6.737427, 108.531061],
            [-6.737391, 108.530989],
            [-6.737292, 108.530983],
            [-6.737199, 108.530993],
            [-6.737120, 108.531008],
            [-6.737011, 108.531023],
            [-6.736955, 108.531011]
        ]
    },
    {
        id: 'saladara',
        name: 'Wilayah Saladara (Kampus 2)',
        shortName: 'Saladara',
        center: [-6.744114, 108.52577],
        coordinates: [
            [-6.744407, 108.525577],
            [-6.743804, 108.525568],
            [-6.743787, 108.525596],
            [-6.743777, 108.525908],
            [-6.743928, 108.525910],
            [-6.743959, 108.525905],
            [-6.744092, 108.525875],
            [-6.744206, 108.525865],
            [-6.744255, 108.525824],
            [-6.744345, 108.525825],
            [-6.744401, 108.525822],
            [-6.744405, 108.525612]
        ]
    },
    {
        id: 'febi',
        name: 'Wilayah FEBI',
        shortName: 'FEBI',
        center: [-6.736258, 108.5329],
        coordinates: [
            [-6.735765, 108.532947],
            [-6.735764, 108.533159],
            [-6.735944, 108.533179],
            [-6.735964, 108.533301],
            [-6.736076, 108.533305],
            [-6.736128, 108.533311],
            [-6.736136, 108.533441],
            [-6.736276, 108.533429],
            [-6.736515, 108.533378],
            [-6.736628, 108.533333],
            [-6.736952, 108.533190],
            [-6.736753, 108.532640],
            [-6.736604, 108.532110],
            [-6.736450, 108.532130],
            [-6.736449, 108.532177],
            [-6.736510, 108.532580],
            [-6.736503, 108.532589],
            [-6.736509, 108.532627],
            [-6.736475, 108.532635],
            [-6.735927, 108.532680],
            [-6.735925, 108.532838],
            [-6.735924, 108.532908],
            [-6.735764, 108.532903]
        ]
    },
    {
        id: 'pasca_maahad',
        name: "Wilayah Pasca ke Ma'had",
        shortName: 'Pasca',
        center: [-6.73478, 108.53127],
        coordinates: [
            [-6.734852, 108.530155],
            [-6.735081, 108.530616],
            [-6.735305, 108.531287],
            [-6.735393, 108.531649],
            [-6.735182, 108.531802],
            [-6.735208, 108.531978],
            [-6.735305, 108.532074],
            [-6.735414, 108.532082],
            [-6.735594, 108.532097],
            [-6.735580, 108.532159],
            [-6.735439, 108.532136],
            [-6.735282, 108.532091],
            [-6.735181, 108.532007],
            [-6.735113, 108.531839],
            [-6.734834, 108.531945],
            [-6.734427, 108.531689],
            [-6.734221, 108.531749],
            [-6.734126, 108.531414],
            [-6.734089, 108.531218],
            [-6.734027, 108.530995],
            [-6.733961, 108.530770],
            [-6.733870, 108.530418],
            [-6.734083, 108.530360],
            [-6.734060, 108.530273],
            [-6.734312, 108.530221],
            [-6.734484, 108.530223],
            [-6.734590, 108.530205],
            [-6.734848, 108.530120]
        ]
    }
];

/**
 * Algoritma Ray-Casting untuk mengecek apakah titik (lat, lng) berada di dalam poligon.
 * @param {Array<number>} point - [lat, lng]
 * @param {Array<Array<number>>} vs - Array titik sudut poligon [[lat1, lng1], [lat2, lng2], ...]
 * @returns {boolean}
 */
function isPointInPolygon(point, vs) {
    if (!point || !vs || vs.length < 3) return false;
    const x = Number(point[0]), y = Number(point[1]);
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Memeriksa apakah suatu koordinat (lat, lng) berada di salah satu zona kampus yang valid.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {{ inside: boolean, zoneName: string|null, zoneId: string|null, shortName: string|null }}
 */
function checkCampusGeofence(lat, lng) {
    if (lat === undefined || lat === null || lng === undefined || lng === null) {
        return { inside: false, zoneName: null, zoneId: null, shortName: null };
    }
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (isNaN(numLat) || isNaN(numLng)) {
        return { inside: false, zoneName: null, zoneId: null, shortName: null };
    }

    for (const zone of CAMPUS_GEOFENCE_ZONES) {
        if (isPointInPolygon([numLat, numLng], zone.coordinates)) {
            return {
                inside: true,
                zoneName: zone.name,
                zoneId: zone.id,
                shortName: zone.shortName
            };
        }
    }
    return { inside: false, zoneName: null, zoneId: null, shortName: null };
}

// Ekspor untuk Node.js (backend) jika dijalankan di Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CAMPUS_GEOFENCE_ZONES,
        isPointInPolygon,
        checkCampusGeofence
    };
}

// Ekspor ke window untuk browser jika di browser
if (typeof window !== 'undefined') {
    window.CAMPUS_GEOFENCE_ZONES = CAMPUS_GEOFENCE_ZONES;
    window.isPointInPolygon = isPointInPolygon;
    window.checkCampusGeofence = checkCampusGeofence;
}
