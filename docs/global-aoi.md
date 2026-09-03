# Global AOI networks

The dashboard is no longer tied to one fixed NCKU location. `config/default.yaml` provides
a small fallback/sample bbox, but generated simulations should use an explicit AOI network.

## Dashboard workflow

1. Open the localhost dashboard.
2. In `Study area`, search for a location, enter a small bbox, or click `Use current view`.
3. Choose `right` or `left` driving side.
4. Click `Build network`.
5. Wait until the network status is `ready`.
6. Choose a scenario preset and click `Run simulation`.

The run request sent by the browser has this shape:

```json
{
  "networkId": "net-...",
  "scenario": {
    "name": "Baseline"
  }
}
```

## Stored artefacts

Each AOI network is registered under:

```text
data/networks/{network_id}/
├── source.osm.xml
├── source.osm.metadata.json
├── source-request.json
├── source-reference.json
├── network.net.xml
├── network.geojson
├── network.metadata.json
└── network.netconvert.log
```

`network.metadata.json` records the AOI bbox, driving side, checksums, SUMO version,
passenger edge/lane/junction counts, cache status and conversion warnings. Generated run
metadata and summaries copy the active `networkId`, network checksum, bbox and driving side.

The older `data/network/` cache remains only for compatibility with existing imported local
data and older scripts.

## API endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/locations/search?q=...` | Search a place name and return a small buildable AOI bbox. |
| `POST /api/networks` | Queue or reuse a small AOI network build. |
| `GET /api/networks` | List registered AOI networks. |
| `GET /api/networks/{network_id}` | Read network metadata. |
| `GET /api/networks/{network_id}/status` | Poll build status. |
| `GET /api/networks/{network_id}/geojson` | Load Cesium-ready network GeoJSON. |
| `DELETE /api/networks/{network_id}` | Delete a registered network when it is not building. |

## Driving side

`right` is the default. For left-hand traffic countries, choose `left`. The builder passes
SUMO `netconvert --lefthand`, which the official SUMO documentation describes as the flag
for creating left-hand traffic networks.

## Limits

This remains a compact exploratory prototype. The AOI must stay small enough for direct OSM
download, `netconvert`, random synthetic demand and browser playback. The backend rejects
AOIs above `max_bbox_area_km2` or `max_bbox_span_degrees`.

Location search uses the local FastAPI server as a Nominatim/OpenStreetMap proxy. It sends
requests only after explicit user searches, includes an identifying User-Agent, caches
responses in `data/cache/location-search`, offers local study-area suggestion chips, and
narrows very large place results to a small AOI around the returned center point.

Changing the AOI does not calibrate demand, signal timing, driver behaviour or safety
thresholds. TTC/DRAC/PET outputs remain surrogate safety indicators for visual analysis, not
operational road-safety evidence.
