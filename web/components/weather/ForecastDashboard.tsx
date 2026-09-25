"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { NormalizedAlertsData } from "@/lib/contracts/alerts";
import { loadWeatherForecast } from "@/lib/client/weather-loader";
import { loadWeatherObservations } from "@/lib/client/observation-loader";
import { loadAirQuality } from "@/lib/client/air-quality-loader";
import { loadWeatherAlerts } from "@/lib/client/alert-loader";
import {
  aggregateDailyForecasts,
  filterDailyForecasts,
  computeSummaryKpis,
  formatTaipeiDateTime,
} from "@/lib/transformations/daily";
import { resolveWeatherBackground, WEATHER_SCENARIOS, WeatherScenarioKey } from "@/lib/theme/background-assets";
import { WeatherAtmosphere } from "./WeatherAtmosphere";
import { filterStationsByCounty, findClosestStation } from "@/lib/transformations/stations";
import { TAIWAN_COUNTY_COORDINATES } from "@/lib/data/county-coordinates";
import { WeatherAlertsBanner } from "./WeatherAlertsBanner";
import { DashboardControls } from "./DashboardControls";
import { CurrentWeatherCard } from "./CurrentWeatherCard";
import { AirQualityCard } from "./AirQualityCard";
import { UVCard } from "./UVCard";
import { KpiCards } from "./KpiCards";
import { TemperatureForecastSection } from "./TemperatureForecastSection";
import { UVTrendChart } from "./UVTrendChart";
import { findDefaultUvDate, getTaipeiTomorrowDateString } from "@/lib/transformations/uv";
import { TaiwanWeatherMap } from "./TaiwanWeatherMap";
import { RawIntervalDetails } from "./RawIntervalDetails";
import { LoadingState } from "../ui/LoadingState";
import { ErrorState } from "../ui/ErrorState";
import { EmptyState } from "../ui/EmptyState";

interface ForecastDashboardProps {
  initialData?: NormalizedForecastData | null;
  initialObservations?: NormalizedObservationData | null;
  initialAirQuality?: NormalizedAirQualityData | null;
  initialAlerts?: NormalizedAlertsData | null;
}

export function ForecastDashboard({
  initialData = null,
  initialObservations = null,
  initialAirQuality = null,
  initialAlerts = null,
}: ForecastDashboardProps) {
  const [data, setData] = useState<NormalizedForecastData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);

  const [observationData, setObservationData] = useState<NormalizedObservationData | null>(initialObservations);
  const [isObservationLoading, setIsObservationLoading] = useState<boolean>(!initialObservations);
  const [observationError, setObservationError] = useState<string | null>(null);

  const [airQualityData, setAirQualityData] = useState<NormalizedAirQualityData | null>(initialAirQuality);
  const [isAirQualityLoading, setIsAirQualityLoading] = useState<boolean>(!initialAirQuality);
  const [airQualityError, setAirQualityError] = useState<string | null>(null);

  const [alertsData, setAlertsData] = useState<NormalizedAlertsData | null>(initialAlerts);
  const [isAlertsLoading, setIsAlertsLoading] = useState<boolean>(!initialAlerts);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [selectedRegionRaw, setSelectedRegion] = useState<string>("臺北市");
  const [startDateRaw, setStartDate] = useState<string>("");
  const [endDateRaw, setEndDate] = useState<string>("");
  const [selectedUvDateRaw, setSelectedUvDateRaw] = useState<string>("");
  const [previewOverride, setPreviewOverride] = useState<WeatherScenarioKey | null>(null);

  // Fetch forecast data from /api/weather/forecast
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadWeatherForecast();
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "載入天氣預報時發生未知錯誤。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch observation data from /api/weather/observations
  const fetchObservations = useCallback(async () => {
    setIsObservationLoading(true);
    setObservationError(null);
    try {
      const result = await loadWeatherObservations();
      setObservationData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "載入即時觀測資料時發生錯誤。";
      setObservationError(message);
    } finally {
      setIsObservationLoading(false);
    }
  }, []);

  // Fetch air quality data from /api/air-quality
  const fetchAirQuality = useCallback(async () => {
    setIsAirQualityLoading(true);
    setAirQualityError(null);
    try {
      const result = await loadAirQuality();
      setAirQualityData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "載入空氣品質資料時發生錯誤。";
      setAirQualityError(message);
    } finally {
      setIsAirQualityLoading(false);
    }
  }, []);

  // Fetch weather alerts data from /api/weather/alerts
  const fetchAlerts = useCallback(async () => {
    setIsAlertsLoading(true);
    setAlertsError(null);
    try {
      const result = await loadWeatherAlerts();
      setAlertsData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "載入天氣警特報資料時發生錯誤。";
      setAlertsError(message);
    } finally {
      setIsAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    let isCancelled = false;

    async function initialLoad() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loadWeatherForecast();
        if (!isCancelled) {
          setData(result);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "載入天氣預報時發生未知錯誤。";
          setError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      isCancelled = true;
    };
  }, [initialData]);

  // Initial load for real-time observations
  useEffect(() => {
    if (initialObservations) return;
    let isCancelled = false;

    async function loadObs() {
      setIsObservationLoading(true);
      setObservationError(null);
      try {
        const result = await loadWeatherObservations();
        if (!isCancelled) {
          setObservationData(result);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "載入即時觀測資料時發生錯誤。";
          setObservationError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsObservationLoading(false);
        }
      }
    }

    loadObs();

    return () => {
      isCancelled = true;
    };
  }, [initialObservations]);

  // Initial load for real-time air quality (MOENV)
  useEffect(() => {
    if (initialAirQuality) return;
    let isCancelled = false;

    async function loadAq() {
      setIsAirQualityLoading(true);
      setAirQualityError(null);
      try {
        const result = await loadAirQuality();
        if (!isCancelled) {
          setAirQualityData(result);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "載入空氣品質資料時發生錯誤。";
          setAirQualityError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsAirQualityLoading(false);
        }
      }
    }

    loadAq();

    return () => {
      isCancelled = true;
    };
  }, [initialAirQuality]);

  // Initial load for weather alerts (CWA)
  useEffect(() => {
    if (initialAlerts) return;
    let isCancelled = false;

    async function loadAlerts() {
      setIsAlertsLoading(true);
      setAlertsError(null);
      try {
        const result = await loadWeatherAlerts();
        if (!isCancelled) {
          setAlertsData(result);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "載入天氣警特報資料時發生錯誤。";
          setAlertsError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsAlertsLoading(false);
        }
      }
    }

    loadAlerts();

    return () => {
      isCancelled = true;
    };
  }, [initialAlerts]);

  // Milestone M13.5: Synchronize preview scenario from URL ONLY after client hydration
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const syncPreviewFromUrl = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const bgParam = urlParams.get("weatherPreview") || urlParams.get("bg");
        if (bgParam && bgParam in WEATHER_SCENARIOS) {
          setPreviewOverride(bgParam as WeatherScenarioKey);
        } else {
          setPreviewOverride(null);
        }
      } catch {
        // ignore
      }
    };

    syncPreviewFromUrl();
    window.addEventListener("popstate", syncPreviewFromUrl);
    return () => {
      window.removeEventListener("popstate", syncPreviewFromUrl);
    };
  }, []);

  // Extract region list
  const regions = useMemo(() => {
    if (!data?.regions) return [];
    return data.regions.map((r) => r.region);
  }, [data]);

  // Derive active selectedRegion
  const selectedRegion = useMemo(() => {
    if (regions.length === 0) return "臺北市";
    if (regions.includes(selectedRegionRaw)) return selectedRegionRaw;
    return regions.includes("臺北市") ? "臺北市" : regions[0];
  }, [regions, selectedRegionRaw]);

  // Representative station for selected region to derive current observations
  const representativeStation = useMemo(() => {
    if (!observationData?.stations) return null;
    const countyStations = filterStationsByCounty(observationData.stations, selectedRegion);
    if (countyStations.length === 0) return null;
    const countyCoords = TAIWAN_COUNTY_COORDINATES[selectedRegion];
    if (countyCoords) {
      return findClosestStation(countyStations, countyCoords.latitude, countyCoords.longitude);
    }
    return countyStations[0];
  }, [observationData, selectedRegion]);

  // Active weather alert for selected region to detect rain/storm conditions
  const activeCountyAlert = useMemo(() => {
    if (!alertsData?.alerts) return null;
    return alertsData.alerts.find(
      (a) => a.affectedAreas.includes(selectedRegion) || a.isNationwide
    );
  }, [alertsData, selectedRegion]);

  // M13.4.1: Resolve dynamic weather background scenario based on Taipei time and strict semantics
  const resolvedBg = useMemo(() => {
    const observedAt =
      representativeStation?.observedAt ||
      observationData?.fetchedAt ||
      data?.fetchedAt ||
      null;
    const dailyPrecipitation = representativeStation?.dailyPrecipitation ?? null;
    const alertHeadline = activeCountyAlert
      ? `${activeCountyAlert.event} ${activeCountyAlert.headline}`
      : null;

    // Strict semantic adherence:
    // - dailyPrecipitation is cumulative daily rainfall, NOT current rainfall.
    // - shortTermPrecipitation (10min/1hr) is not in the current O-A0003-001 contract yet.
    // - Alerts are auxiliary only and cannot prove current rain.
    // - Without reliable short-term precipitation or real-time weather phenomenon,
    //   background safely switches based on time using neutral scenario.
    // Development-only background preview is synced post-hydration via previewOverride
    return resolveWeatherBackground({
      observedAt,
      dailyPrecipitation,
      shortTermPrecipitation: null,
      currentWeatherPhenomenon: null,
      weatherAlertHeadline: alertHeadline,
      overrideScenario: previewOverride,
    });
  }, [representativeStation, observationData?.fetchedAt, data?.fetchedAt, activeCountyAlert, previewOverride]);

  // Apply resolved background to the single #weather-bg-layer with gentle opacity fade
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bgEl = document.getElementById("weather-bg-layer");
    if (!bgEl) return;

    const currentScenario = bgEl.getAttribute("data-weather-scenario");
    if (currentScenario === resolvedBg.backgroundKey) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      bgEl.style.backgroundImage = `url('${resolvedBg.assetPath}'), ${resolvedBg.fallbackGradient}`;
      bgEl.setAttribute("data-weather-scenario", resolvedBg.backgroundKey);
      return;
    }

    // Cross-fade: opacity 300~500ms
    bgEl.classList.add("bg-fading");
    const timer = setTimeout(() => {
      bgEl.style.backgroundImage = `url('${resolvedBg.assetPath}'), ${resolvedBg.fallbackGradient}`;
      bgEl.setAttribute("data-weather-scenario", resolvedBg.backgroundKey);
      bgEl.classList.remove("bg-fading");
    }, 200);

    return () => {
      clearTimeout(timer);
      bgEl.classList.remove("bg-fading");
    };
  }, [resolvedBg]);

  // Find intervals and UV forecasts for selected region
  const activeRegionData = useMemo(() => {
    if (!data || !selectedRegion) return null;
    return data.regions.find((r) => r.region === selectedRegion) ?? null;
  }, [data, selectedRegion]);

  const activeRegionIntervals = useMemo(() => {
    return activeRegionData?.intervals ?? [];
  }, [activeRegionData]);

  const activeUvForecasts = useMemo(() => {
    return activeRegionData?.uvForecasts ?? [];
  }, [activeRegionData]);

  // Daily aggregated forecasts for active region, including optional UV mapping
  const allDailyList = useMemo(() => {
    return aggregateDailyForecasts(activeRegionIntervals, activeUvForecasts);
  }, [activeRegionIntervals, activeUvForecasts]);

  // Available unique dates
  const availableDates = useMemo(() => {
    return allDailyList.map((d) => d.forecastDate);
  }, [allDailyList]);

  // Derive start and end dates
  const startDate = useMemo(() => {
    if (availableDates.length === 0) return "";
    if (startDateRaw && availableDates.includes(startDateRaw)) return startDateRaw;
    return availableDates[0];
  }, [availableDates, startDateRaw]);

  const endDate = useMemo(() => {
    if (availableDates.length === 0) return "";
    if (endDateRaw && availableDates.includes(endDateRaw)) return endDateRaw;
    return availableDates[availableDates.length - 1];
  }, [availableDates, endDateRaw]);

  // Filtered daily forecasts based on chosen date range
  const filteredDailyList = useMemo(() => {
    return filterDailyForecasts(allDailyList, startDate, endDate);
  }, [allDailyList, startDate, endDate]);

  // Summary KPIs for filtered range
  const summaryKpis = useMemo(() => {
    return computeSummaryKpis(filteredDailyList);
  }, [filteredDailyList]);

  // Filter UV forecasts by dashboard-wide date range (startDate ~ endDate)
  const filteredUvList = useMemo(() => {
    if (!activeUvForecasts || activeUvForecasts.length === 0) return [];
    return activeUvForecasts.filter((item) => {
      if (startDate && item.forecastDate < startDate) return false;
      if (endDate && item.forecastDate > endDate) return false;
      return true;
    });
  }, [activeUvForecasts, startDate, endDate]);

  const availableUvDates = useMemo(() => {
    return filteredUvList.map((u) => u.forecastDate);
  }, [filteredUvList]);

  // Derive active selected UV date (default: today -> closest future -> closest past)
  const selectedUvDate = useMemo(() => {
    if (availableUvDates.length === 0) return "";
    if (selectedUvDateRaw && availableUvDates.includes(selectedUvDateRaw)) {
      return selectedUvDateRaw;
    }
    return findDefaultUvDate(availableUvDates);
  }, [availableUvDates, selectedUvDateRaw]);

  // Active UV forecast item for currently selected UV date
  const activeUvItem = useMemo(() => {
    if (!selectedUvDate || filteredUvList.length === 0) return null;
    return filteredUvList.find((u) => u.forecastDate === selectedUvDate) ?? null;
  }, [filteredUvList, selectedUvDate]);

  // Tomorrow UV item (for showing hint if today has ended)
  const tomorrowUvItem = useMemo(() => {
    const tomorrowStr = getTaipeiTomorrowDateString();
    return activeUvForecasts.find((u) => u.forecastDate === tomorrowStr) ?? null;
  }, [activeUvForecasts]);

  const handleResetDates = () => {
    if (availableDates.length > 0) {
      setStartDate(availableDates[0]);
      setEndDate(availableDates[availableDates.length - 1]);
    }
  };

  const formattedFetchedAt = data?.fetchedAt ? formatTaipeiDateTime(data.fetchedAt) : "—";

  const handleSelectRegionFromMap = React.useCallback((regionName: string) => {
    setSelectedRegion(regionName);
    if (typeof window !== "undefined") {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const elem = document.getElementById("dashboard-main-controls");
      if (elem) {
        elem.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    }
  }, []);

  return (
    <div className="dashboard-container">
      {/* Milestone M13.5: Weather Atmosphere Ambient Overlay */}
      <WeatherAtmosphere scenario={resolvedBg.backgroundKey} />

      {/* Header: Clean, compact Apple Weather inspired header */}
      <header className="dashboard-header">
        <div className="header-brand">
          <h1 className="header-title">
            臺灣即時氣象 <span className="header-title-sub">Taiwan Weather Dashboard</span>
          </h1>
          <p className="header-subtitle">
            中央氣象署即時觀測・七天預報・空氣品質儀表板
          </p>
        </div>

        <div className="header-metadata" aria-label="資料同步與來源資訊">
          <div className="meta-text-group">
            <span className="meta-line">
              <span className="meta-label">最後同步 (Taipei)：</span>
              <span className="meta-value font-mono">{formattedFetchedAt}</span>
            </span>
            <span className="meta-divider" aria-hidden="true">•</span>
            <span className="meta-line">
              <span className="meta-label">資料來源：</span>
              <span className="meta-value">交通部中央氣象署</span>
            </span>
            <span className="meta-divider" aria-hidden="true">•</span>
            <span className="meta-line meta-dataset">
              <span className="meta-label">資料集：</span>
              <span className="meta-value font-mono">{data?.datasetId || "F-D0047-091"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isLoading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : !data || regions.length === 0 ? (
        <EmptyState onReset={fetchData} />
      ) : (
        <main className="dashboard-main-content">
          {/* Weather Alerts Banner */}
          <WeatherAlertsBanner
            selectedRegion={selectedRegion}
            alerts={alertsData?.alerts ?? []}
            isLoading={isAlertsLoading}
            error={alertsError}
            onRetry={fetchAlerts}
          />

          {/* Controls: Region + Date Filter + Refresh */}
          <DashboardControls
            regions={regions}
            selectedRegion={selectedRegion}
            onSelectRegion={setSelectedRegion}
            availableDates={availableDates}
            startDate={startDate}
            endDate={endDate}
            onSelectStartDate={setStartDate}
            onSelectEndDate={setEndDate}
            onResetDates={handleResetDates}
            onRefresh={() => {
              fetchData();
              fetchObservations();
              fetchAirQuality();
              fetchAlerts();
            }}
            isLoading={isLoading || isObservationLoading || isAirQualityLoading || isAlertsLoading}
          />

          {/* Hero Weather Section: Primary Current Weather + UV + AQI */}
          <div className="hero-weather-grid">
            {/* Real-time Weather Station Observation */}
            <CurrentWeatherCard
              region={selectedRegion}
              observationData={observationData}
              isLoading={isObservationLoading}
              error={observationError}
              onRetry={fetchObservations}
            />

            {/* UV Index Forecast Card */}
            <UVCard
              region={selectedRegion}
              selectedDate={selectedUvDate}
              uvItem={activeUvItem}
              tomorrowUvItem={tomorrowUvItem}
              isLoading={isLoading}
              error={null}
            />

            {/* Real-time Air Quality Observation (MOENV) */}
            <AirQualityCard
              region={selectedRegion}
              airQualityData={airQualityData}
              isLoading={isAirQualityLoading}
              error={airQualityError}
              onRetry={fetchAirQuality}
            />
          </div>

          {/* KPI Summary Cards */}
          <KpiCards region={selectedRegion} kpis={summaryKpis} />

          {/* Unified 7-Day Temperature Forecast Section (Segmented Control: 趨勢圖 / 每日詳情) */}
          <TemperatureForecastSection
            dailyList={filteredDailyList}
            region={selectedRegion}
            startDate={startDate}
            endDate={endDate}
          />

          {/* Daily Daytime UV Trend Chart */}
          <UVTrendChart
            dailyUvList={filteredUvList}
            region={selectedRegion}
            selectedDate={selectedUvDate}
            onSelectDate={setSelectedUvDateRaw}
          />

          {/* Interactive Taiwan Map */}
          <TaiwanWeatherMap
            data={data}
            observationData={observationData}
            airQualityData={airQualityData}
            selectedRegion={selectedRegion}
            onSelectRegion={handleSelectRegionFromMap}
            availableDates={availableDates}
          />

          {/* Collapsible Raw 12h Intervals Details */}
          <RawIntervalDetails
            intervals={activeRegionIntervals}
            region={selectedRegion}
          />
        </main>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>
          AIOT Course Homework 1 — V2 Stateless Architecture・Next.js 16 + React 19 + TypeScript
        </p>
        <p className="footer-sub">
          氣象資料由交通部中央氣象署提供・地圖底圖由 OpenStreetMap 維護者授權
        </p>
      </footer>
    </div>
  );
}
