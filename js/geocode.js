// ---------------------------------------------------------------------------
// Coarse, human-readable location for the admin dashboard — deliberately
// *not* IP-address tracking. Every report already carries a public lat/lng
// (it's the pin every citizen sees on the shared map), so this just turns
// those coordinates into a readable area name via OpenStreetMap's free
// Nominatim reverse-geocoding endpoint.
//
// Fetched on demand (one row's "look up area name" button) rather than
// automatically for every report in the list, and cached by rounded
// coordinate — Nominatim's public instance asks callers to stay well under
// its rate limit, and a whole admin dashboard's worth of rows firing at
// once would not.
// ---------------------------------------------------------------------------
const cache = new Map();

export async function reverseGeocodeCoarse(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  const promise = fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const a = data?.address;
      if (!a) return null;
      const parts = [a.suburb || a.neighbourhood || a.road, a.city || a.town || a.village, a.state].filter(Boolean);
      return parts.length ? parts.join(", ") : null;
    })
    .catch(() => null);

  cache.set(key, promise);
  return promise;
}
