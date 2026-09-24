"use client";

import React, { useMemo, useRef, useEffect, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  GeoJSON,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CountyMapMarkerData } from "@/lib/map/marker-helpers";
import { UnifiedMapMarker } from "@/lib/map/layer-helpers";
import { MapZoomTier, getMapZoomTier } from "@/lib/map/layer-config";
import {
  TAIWAN_COUNTIES_GEOJSON,
  normalizeCountyName,
  getCountyBounds,
} from "@/lib/data/taiwan-counties";

export interface LeafletMapInnerProps {
  markers: (UnifiedMapMarker | CountyMapMarkerData)[];
  onSelectRegion?: (region: string) => void;
  selectedRegion?: string;
  zoomTier?: MapZoomTier;
  currentZoom?: number;
  onZoomChange?: (zoom: number) => void;
  focusRequest?: { region: string; timestamp: number } | null;
}

/**
 * Returns Leaflet path style options for a county boundary polygon.
 * - Selected: distinct sky-400 accent border (2.5px), faint tinted fill (0.12 opacity)
 * - Unselected: subtle thin border (1px), near-transparent fill (0.03 opacity)
 * - Stacked in overlayPane below markers
 */
export function getCountyPolygonStyle(
  featureCountyName: string,
  selectedCountyName?: string
): L.PathOptions {
  const isSelected =
    Boolean(selectedCountyName) &&
    normalizeCountyName(featureCountyName) === normalizeCountyName(selectedCountyName!);

  if (isSelected) {
    return {
      color: "#38bdf8",
      weight: 2.5,
      opacity: 0.95,
      fillColor: "#38bdf8",
      fillOpacity: 0.12,
      pane: "overlayPane",
    };
  }

  return {
    color: "rgba(148, 163, 184, 0.45)",
    weight: 1,
    opacity: 0.7,
    fillColor: "rgba(148, 163, 184, 0.08)",
    fillOpacity: 0.03,
    pane: "overlayPane",
  };
}

function MapEventsHandler({
  onZoomChange,
  mapRef,
}: {
  onZoomChange?: (zoom: number) => void;
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const map = useMapEvents({
    zoomend: (e) => {
      onZoomChange?.(e.target.getZoom());
    },
  });

  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  return null;
}

export function LeafletMapInner({
  markers,
  onSelectRegion,
  selectedRegion,
  zoomTier,
  currentZoom,
  onZoomChange,
  focusRequest,
}: LeafletMapInnerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const countyLayersRef = useRef<Map<string, L.Path>>(new Map());

  const activeTier: MapZoomTier = useMemo(() => {
    if (zoomTier) return zoomTier;
    if (currentZoom !== undefined) return getMapZoomTier(currentZoom);
    return "overview";
  }, [zoomTier, currentZoom]);

  /**
   * Fit map viewport to the complete bounds of a county with generous padding.
   * Uses layer.getBounds() from GeoJSON or precomputed bounds.
   */
  const focusCounty = useCallback((countyName: string) => {
    if (!mapRef.current) return;
    const normalized = normalizeCountyName(countyName);
    const layer = countyLayersRef.current.get(normalized);

    let bounds: L.LatLngBounds | null = null;
    if (layer && typeof (layer as L.Polygon).getBounds === "function") {
      const layerBounds = (layer as L.Polygon).getBounds();
      if (layerBounds.isValid()) {
        bounds = layerBounds;
      }
    }

    if (!bounds) {
      const rawBounds = getCountyBounds(normalized);
      if (rawBounds) {
        bounds = L.latLngBounds(rawBounds);
      }
    }

    if (bounds && bounds.isValid()) {
      mapRef.current.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 12,
      });
    }
  }, []);

  // Respond to focus requests triggered from parent components
  useEffect(() => {
    if (!focusRequest || !mapRef.current) return;
    focusCounty(focusRequest.region);
  }, [focusRequest, focusCounty]);

  // Update GeoJSON polygon styles directly on selectedRegion change without recreating map
  useEffect(() => {
    if (!geoJsonRef.current) return;
    geoJsonRef.current.setStyle((feature) => {
      const countyName = feature?.properties?.COUNTYNAME || "";
      return getCountyPolygonStyle(countyName, selectedRegion);
    });
  }, [selectedRegion]);

  // Pre-generate safe divIcons based on semantic zoom tier
  const markerIcons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const m of markers) {
      const u = m as Partial<UnifiedMapMarker>;
      const displayVal = u.badgeValue ?? (m.maxTemp !== null ? `${Math.round(m.maxTemp)}°` : "—");
      const badgeName = u.badgeName ?? m.region.slice(0, 2);
      const hex = u.colorHex ?? m.colorStyle.hex;
      const isSelected = m.region === selectedRegion;
      const isDot = (activeTier === "station_dots" || u.zoomTier === "station_dots") && !u.isCountySummary;

      const key = u.id ?? m.region;

      if (isDot) {
        // Tier 2: Station dots (compact colored circle with comfortable 24x24 hit area, no permanent name)
        const dotBorder = isSelected
          ? "border: 1.5px solid #ffffff; box-shadow: 0 0 6px rgba(56, 189, 248, 0.7); transform: scale(1.25);"
          : "border: 1.5px solid rgba(255,255,255,0.85); box-shadow: 0 1px 4px rgba(0,0,0,0.5);";

        const icon = L.divIcon({
          className: "custom-leaflet-marker marker-dot-container",
          html: `
            <div class="map-dot-hitarea" title="${u.tooltipText ?? `${m.region}: ${displayVal}`}" role="button" aria-label="${u.tooltipText ?? `${m.region}: ${displayVal}`}">
              <div class="map-station-dot" style="background-color: ${hex}; ${dotBorder}"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -12],
        });
        map.set(key, icon);
      } else {
        // Tier 1 (Overview summary) or Tier 3 (Detailed stations): short name + value badge
        const borderStyle = isSelected
          ? "border: 1.5px solid #ffffff; box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);"
          : "border: 1px solid rgba(255,255,255,0.35);";
        const summaryClass = u.isCountySummary ? "map-badge-summary" : "";

        const icon = L.divIcon({
          className: "custom-leaflet-marker marker-badge-container",
          html: `
            <div style="background-color: ${hex}; ${borderStyle}" class="map-badge ${summaryClass}" title="${u.tooltipText ?? `${m.region}: ${displayVal}`}" role="button" aria-label="${u.tooltipText ?? `${m.region}: ${displayVal}`}">
              <span class="map-badge-reg">${badgeName}</span>
              <span class="map-badge-temp">${displayVal}</span>
            </div>
          `,
          iconSize: [48, 26],
          iconAnchor: [24, 13],
          popupAnchor: [0, -14],
        });
        map.set(key, icon);
      }
    }
    return map;
  }, [markers, selectedRegion, activeTier]);

  return (
    <MapContainer
      ref={mapRef}
      center={[23.7, 120.95]}
      zoom={7}
      scrollWheelZoom={true}
      doubleClickZoom={true}
      dragging={true}
      touchZoom={true}
      boxZoom={true}
      keyboard={true}
      zoomControl={true}
      className="leaflet-dashboard-map"
      style={{ height: "480px", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors | 行政界線：<a href="https://data.gov.tw/dataset/7442" target="_blank" rel="noopener noreferrer">內政部 2025-03-18 (OGL-Taiwan 1.0)</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapEventsHandler onZoomChange={onZoomChange} mapRef={mapRef} />

      {/* Taiwan 22 Counties Administrative Boundaries Layer (rendered in overlayPane, below markers) */}
      <GeoJSON
        ref={geoJsonRef}
        data={TAIWAN_COUNTIES_GEOJSON}
        style={(feature) => {
          const countyName = feature?.properties?.COUNTYNAME || "";
          return getCountyPolygonStyle(countyName, selectedRegion);
        }}
        onEachFeature={(feature, layer) => {
          const countyName = normalizeCountyName(feature.properties?.COUNTYNAME || "");
          if (countyName) {
            countyLayersRef.current.set(countyName, layer as L.Path);
          }
          layer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              if (countyName) {
                onSelectRegion?.(countyName);
              }
            },
          });
        }}
      />

      {/* Floating Focus Button inside Map Container for Quick Access */}
      {selectedRegion && (
        <div className="leaflet-top leaflet-right map-floating-focus-container">
          <div className="leaflet-control">
            <button
              type="button"
              className="map-focus-floating-btn"
              data-testid="map-focus-floating-btn"
              aria-label={`聚焦${selectedRegion}縣市範圍`}
              title={`以地圖完整顯示${selectedRegion}行政邊界`}
              onClick={() => focusCounty(selectedRegion)}
            >
              🎯 聚焦{selectedRegion}
            </button>
          </div>
        </div>
      )}

      {markers.map((m) => {
        const u = m as Partial<UnifiedMapMarker>;
        const key = u.id ?? m.region;
        const icon = markerIcons.get(key);
        const isDot = (activeTier === "station_dots" || u.zoomTier === "station_dots") && !u.isCountySummary;

        const title = u.popupTitle ?? `📍 ${m.region}`;
        const subtitle = u.popupSubtitle ?? `📅 預報日期：${m.forecastDate}`;
        const rows = u.popupRows ?? [
          {
            label: "🔥 最高氣溫",
            value: m.maxTemp !== null && Number.isFinite(m.maxTemp) ? `${m.maxTemp.toFixed(1)} °C` : "無資料",
            color: m.maxTemp !== null && m.maxTemp >= 30 ? "#ef4444" : undefined,
          },
          {
            label: "❄️ 最低氣溫",
            value: m.minTemp !== null && Number.isFinite(m.minTemp) ? `${m.minTemp.toFixed(1)} °C` : "無資料",
          },
          {
            label: "📊 預報時段",
            value: `${m.isPartial ? "部分資料" : "完整預報"} (${m.intervalCount} 個)`,
          },
        ];

        return (
          <Marker
            key={key}
            position={[m.latitude, m.longitude]}
            icon={icon}
          >
            {/* Tooltip for hover / focus */}
            <Tooltip
              direction="top"
              offset={[0, isDot ? -10 : -14]}
              opacity={0.95}
              className="map-marker-tooltip"
            >
              <span>{u.tooltipText ?? `${m.region}: ${u.badgeValue ?? ""}`}</span>
            </Tooltip>

            {/* Click Popup with clean hierarchy & actions */}
            <Popup className="weather-map-popup">
              <div className="popup-content">
                <div className="popup-header-row">
                  <h4 className="popup-heading">{title}</h4>
                  {u.isCountySummary && (
                    <span className="popup-tag">縣市摘要</span>
                  )}
                </div>
                <div className="popup-meta">{subtitle}</div>
                <hr className="popup-sep" />
                {rows.map((row, idx) => (
                  <div key={idx} className="popup-row">
                    <span className="popup-row-label">{row.label}：</span>
                    <b className="popup-row-value" style={{ color: row.color }}>{row.value}</b>
                  </div>
                ))}
                <div className="popup-actions">
                  <button
                    type="button"
                    className="popup-select-btn"
                    aria-label={`切換主面板至${m.region} ↑`}
                    onClick={(e) => {
                      e.stopPropagation();
                      mapRef.current?.closePopup();
                      onSelectRegion?.(m.region);
                    }}
                  >
                    切換主面板至{m.region} ↑
                  </button>

                  <button
                    type="button"
                    className="popup-focus-btn"
                    data-testid="popup-focus-btn"
                    aria-label={`聚焦${m.region}行政範圍`}
                    onClick={(e) => {
                      e.stopPropagation();
                      mapRef.current?.closePopup();
                      focusCounty(m.region);
                    }}
                  >
                    🎯 聚焦{m.region}邊界
                  </button>

                  {u.isCountySummary && u.layerCategory !== "forecast" && u.targetLatitude !== undefined && u.targetLongitude !== undefined && (
                    <button
                      type="button"
                      className="popup-zoom-btn"
                      aria-label={`放大查看${m.region}測站詳情`}
                      onClick={(e) => {
                        e.stopPropagation();
                        mapRef.current?.closePopup();
                        mapRef.current?.flyTo([u.targetLatitude!, u.targetLongitude!], 10, { duration: 0.8 });
                      }}
                    >
                      🔍 放大查看測站
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

export default LeafletMapInner;
