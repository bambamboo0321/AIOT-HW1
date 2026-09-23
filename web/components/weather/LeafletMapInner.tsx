"use client";

import React, { useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CountyMapMarkerData } from "@/lib/map/marker-helpers";

interface LeafletMapInnerProps {
  markers: CountyMapMarkerData[];
  onSelectRegion?: (region: string) => void;
  selectedRegion?: string;
}

export function LeafletMapInner({
  markers,
  onSelectRegion,
  selectedRegion,
}: LeafletMapInnerProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Pre-generate safe divIcons
  const markerIcons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    for (const m of markers) {
      const tempDisplay = m.maxTemp !== null ? `${Math.round(m.maxTemp)}°` : "—";
      const isSelected = m.region === selectedRegion;
      const borderStyle = isSelected ? "border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.8);" : "border: 1px solid rgba(255,255,255,0.4);";

      const icon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `
          <div style="background-color: ${m.colorStyle.hex}; ${borderStyle}" class="map-badge" title="${m.region}: ${tempDisplay}">
            <span class="map-badge-reg">${m.region.slice(0, 2)}</span>
            <span class="map-badge-temp">${tempDisplay}</span>
          </div>
        `,
        iconSize: [46, 26],
        iconAnchor: [23, 13],
        popupAnchor: [0, -14],
      });
      map.set(m.region, icon);
    }
    return map;
  }, [markers, selectedRegion]);

  return (
    <MapContainer
      ref={mapRef}
      center={[23.7, 120.95]}
      zoom={7}
      scrollWheelZoom={false}
      className="leaflet-dashboard-map"
      style={{ height: "480px", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {markers.map((m) => {
        const icon = markerIcons.get(m.region);
        const maxDisplay =
          m.maxTemp !== null && Number.isFinite(m.maxTemp)
            ? `${m.maxTemp.toFixed(1)} °C`
            : "無資料";
        const minDisplay =
          m.minTemp !== null && Number.isFinite(m.minTemp)
            ? `${m.minTemp.toFixed(1)} °C`
            : "無資料";

        return (
          <Marker
            key={m.region}
            position={[m.latitude, m.longitude]}
            icon={icon}
          >
            <Popup className="weather-map-popup">
              <div className="popup-content">
                <h4 className="popup-heading">📍 {m.region}</h4>
                <div className="popup-meta">📅 預報日期：{m.forecastDate}</div>
                <hr className="popup-sep" />
                <div className="popup-row">
                  <span className="text-red">🔥 最高氣溫：</span>
                  <b>{maxDisplay}</b>
                </div>
                <div className="popup-row">
                  <span className="text-blue">❄️ 最低氣溫：</span>
                  <b>{minDisplay}</b>
                </div>
                <div className="popup-row">
                  <span>📊 預報時段：</span>
                  <span>
                    {m.isPartial ? "部分資料" : "完整預報"} ({m.intervalCount} 個)
                  </span>
                </div>
                <div style={{ marginTop: "10px", textAlign: "center" }}>
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
