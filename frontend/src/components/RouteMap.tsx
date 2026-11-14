import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Assignment, Center, Depot, DistanceMode, Route } from "../types";
import { km } from "../utils/format";

/** Patrones de trazo por vehículo: identidad que no depende solo del color. */
export const DASH_PATTERNS = ["10 7", "2 8", "16 6 2 6", "6 6", "20 8", "2 5 10 5", "12 4", "4 10"];

interface Props {
  depot: Depot;
  centers: Center[];
  distanceMode: DistanceMode;
  routes?: Route[];
  assignments?: Assignment[];
  title?: string;
}

type LatLng = [number, number];

function hasCoords(point: { lat: number | null; lon: number | null }): boolean {
  return (
    typeof point.lat === "number" &&
    typeof point.lon === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    // `key` resume las coordenadas: solo se reajusta la vista cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

const depotIcon = L.divIcon({
  className: "",
  html: '<div class="depot-icon" aria-hidden="true">D</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function RouteMap({ depot, centers, distanceMode, routes, assignments, title }: Props) {
  const [tiles, setTiles] = useState(true);
  const [tileError, setTileError] = useState(false);
  // En pantallas angostas el mapa empieza plegado: KPIs, tabla y hojas de ruta bastan.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 960px)").matches,
  );
  const located = useMemo(() => centers.filter(hasCoords), [centers]);
  const depotOk = hasCoords(depot);
  const byId = useMemo(() => new Map(centers.map((c) => [c.id, c])), [centers]);
  const assignmentById = useMemo(
    () => new Map((assignments ?? []).map((a) => [a.center_id, a])),
    [assignments],
  );
  const vehicleIndex = useMemo(
    () => new Map((routes ?? []).map((route, index) => [route.vehicle_id, index])),
    [routes],
  );

  const points: LatLng[] = [
    ...(depotOk ? [[depot.lat as number, depot.lon as number] as LatLng] : []),
    ...located.map((c) => [c.lat as number, c.lon as number] as LatLng),
  ];

  const usedRoutes = (routes ?? []).filter((route) => route.used);
  const missing = centers.length - located.length;
  const straight = distanceMode === "haversine_demo";

  if (points.length === 0) {
    return (
      <section className="card map-card">
        <h3>{title ?? "Mapa"}</h3>
        <p className="muted">
          Este escenario no tiene coordenadas (con matriz vial son opcionales). La tabla de
          asignaciones y las hojas de ruta contienen toda la información.
        </p>
      </section>
    );
  }

  return (
    <section className="card map-card">
      <div className="card-title">
        <h3>{title ?? "Mapa"}</h3>
        <div className="row no-print">
          {open && (
            <label className="row small" style={{ gap: "0.4rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={tiles}
                onChange={(event) => {
                  setTileError(false);
                  setTiles(event.target.checked);
                }}
                style={{ width: "1.1rem", height: "1.1rem", accentColor: "var(--accent)" }}
              />
              Mapa base (OpenStreetMap)
            </label>
          )}
          <button
            type="button"
            className="btn small"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Ocultar mapa" : "Mostrar mapa"}
          </button>
        </div>
      </div>
      <div
        hidden={!open}
        className="map-frame"
        role="region"
        aria-label="Mapa de centros y rutas. La misma información está disponible en las tablas y hojas de ruta de esta página."
      >
        {open && (
          <MapContainer center={points[0]} zoom={12} scrollWheelZoom={false} keyboard>
            {tiles && (
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={18}
                referrerPolicy="strict-origin-when-cross-origin"
                attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                eventHandlers={{
                  tileerror: () => {
                    setTileError(true);
                    setTiles(false);
                  },
                }}
              />
            )}
            <FitBounds points={points} />

            {depotOk &&
              usedRoutes.map((route) => {
                const index = vehicleIndex.get(route.vehicle_id) ?? 0;
                const stops = route.stops
                  .map((stop) => byId.get(stop.center_id))
                  .filter((c): c is Center => !!c && hasCoords(c))
                  .map((c) => [c.lat as number, c.lon as number] as LatLng);
                const depotPoint: LatLng = [depot.lat as number, depot.lon as number];
                return (
                  <Polyline
                    key={route.vehicle_id}
                    positions={[depotPoint, ...stops, depotPoint]}
                    className={`route-line veh-${index % 8}`}
                    pathOptions={{
                      className: `route-line veh-${index % 8}`,
                      dashArray: DASH_PATTERNS[index % DASH_PATTERNS.length],
                      weight: 3,
                      interactive: false,
                    }}
                  />
                );
              })}

            {located.map((center) => {
              const assignment = assignmentById.get(center.id);
              const index = assignment?.vehicle_id
                ? (vehicleIndex.get(assignment.vehicle_id) ?? 0)
                : -1;
              const className = !assignments
                ? "center-dot plain"
                : index >= 0
                  ? `center-dot veh-${index % 8}`
                  : "center-dot unserved";
              return (
                <CircleMarker
                  key={`${center.id}-${className}`}
                  center={[center.lat as number, center.lon as number]}
                  radius={7}
                  className={className}
                  pathOptions={{ className, weight: 2, fillOpacity: 1 }}
                >
                  {centers.length <= 25 && (
                    <Tooltip permanent direction="top" offset={[0, -7]} className="map-label">
                      {center.id}
                    </Tooltip>
                  )}
                  <Popup>
                    <strong>{center.name}</strong> <span className="mono">({center.id})</span>
                    <br />
                    Demanda: {center.demand_lots ?? "—"} lotes · prioridad{" "}
                    {center.priority_weight ?? "—"}
                    {assignment && (
                      <>
                        <br />
                        Asignado: {assignment.assigned_lots} lotes · pendiente{" "}
                        {assignment.pending_lots}
                        <br />
                        {assignment.vehicle_id
                          ? `Vehículo ${assignment.vehicle_id}, parada ${assignment.stop_order}`
                          : "Sin entrega en esta solución"}
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              );
            })}

            {depotOk && (
              <Marker
                position={[depot.lat as number, depot.lon as number]}
                icon={depotIcon}
                keyboard
              >
                <Popup>
                  <strong>{depot.name ?? "Depósito"}</strong>{" "}
                  <span className="mono">({depot.id})</span>
                  <br />
                  Origen y fin de todas las rutas.
                </Popup>
              </Marker>
            )}
          </MapContainer>
        )}
      </div>

      {tileError && open && (
        <div className="row small map-tile-status" role="status">
          <span className="grow">
            No se pudo cargar el mapa base. Los centros y las rutas siguen disponibles.
          </span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setTileError(false);
              setTiles(true);
            }}
          >
            Reintentar mapa base
          </button>
        </div>
      )}

      <ul className="legend" aria-label="Leyenda del mapa">
        <li>
          <span
            className="depot-icon"
            style={{ width: 16, height: 16, fontSize: 9 }}
            aria-hidden="true"
          >
            D
          </span>
          Depósito
        </li>
        {usedRoutes.map((route) => {
          const index = vehicleIndex.get(route.vehicle_id) ?? 0;
          return (
            <li key={route.vehicle_id} className={`veh-${index % 8}`}>
              <svg width="30" height="10" aria-hidden="true">
                <line
                  x1="1"
                  y1="5"
                  x2="29"
                  y2="5"
                  className="route-line"
                  strokeDasharray={DASH_PATTERNS[index % DASH_PATTERNS.length]}
                />
              </svg>
              <span className="mono">{route.vehicle_id}</span> · {km(route.km)}
            </li>
          );
        })}
        {assignments && (
          <li>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" className="center-dot unserved" />
            </svg>
            Centro sin entrega
          </li>
        )}
        {!assignments && (
          <li>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" className="center-dot plain" />
            </svg>
            Centro
          </li>
        )}
      </ul>
      <p className="small muted">
        {usedRoutes.length > 0 &&
          (straight
            ? "Las líneas discontinuas unen las paradas en línea recta (Haversine): son una aproximación, no el trazado de calles. "
            : "Las líneas discontinuas son conexiones esquemáticas entre paradas: los km provienen de la matriz vial, pero no se dibuja el trazado de las vías. ")}
        {missing > 0 && `${missing} centro(s) sin coordenadas no aparecen en el mapa. `}
        Las hojas de ruta y la tabla ofrecen la misma información sin usar el mapa.
      </p>
    </section>
  );
}
