"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./cars.module.css";

interface Car {
  id: number;
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by: number;
  created_at: string;
  total_slots: number;
  locked_slots: number;
  empty_slots: number;
}

interface UserInfo {
  userId: number;
  email: string;
  region: string;
  role: string;
}

export default function CarsPage() {
  const router = useRouter();
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<"actual" | "archive">("actual");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogout, setShowLogout] = useState(false);

  const fetchRegions = useCallback(async () => {
    try {
      const res = await fetch("/api/config/regions");
      if (res.ok) {
        const data = await res.json();
        const regions: string[] = (data.regions || []).filter((r: string) => r !== "ALL");
        setAvailableRegions(regions);
        return regions;
      }
    } catch {
      const fallback = ["R1", "R2", "R3", "K1", "V", "S1", "S2"];
      setAvailableRegions(fallback);
      return fallback;
    }
    return [];
  }, []);

  const fetchUserInfo = useCallback(async (regions: string[]) => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        return;
      }
      const data: UserInfo = await res.json();
      setUserInfo(data);
      if (data.region !== "ALL") {
        setActiveRegion(data.region);
      } else if (regions.length > 0) {
        setActiveRegion(regions[0]);
      }
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    fetchRegions().then((regions) => fetchUserInfo(regions));
  }, [fetchRegions, fetchUserInfo]);

  const fetchCars = useCallback(async (region: string, status: "actual" | "archive") => {
    if (!region) return;
    setLoading(true);
    setError("");
    try {
      const regionParam = status === "archive" ? "ALL" : region;
      const res = await fetch(`/api/cars?region=${regionParam}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        throw new Error("Failed to fetch cars");
      }
      const data = await res.json();
      setCars(data.cars || []);
    } catch {
      setError("Не удалось загрузить список автомобилей.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (activeRegion) {
      fetchCars(activeRegion, activeStatus);
    }
  }, [activeRegion, activeStatus, fetchCars]);

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/login");
  };

  const filteredCars = cars.filter((car) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      car.vin.toLowerCase().includes(q) ||
      car.make.toLowerCase().includes(q) ||
      car.model.toLowerCase().includes(q) ||
      car.region.toLowerCase().includes(q)
    );
  });

  const isAdmin = userInfo?.role === "admin";

  return (
    <div className={styles.page}>
      <div className={styles.mainContainer}>
        {/* Header row */}
        <div className={styles.headerRow}>
          {/* Status capsule */}
          <div className={styles.statusCapsule}>
            <button
              className={`${styles.statusBtn} ${activeStatus === "actual" ? styles.active : ""}`}
              onClick={() => setActiveStatus("actual")}
            >
              Актуальные
            </button>
            <button
              className={`${styles.statusBtn} ${activeStatus === "archive" ? styles.active : ""}`}
              onClick={() => setActiveStatus("archive")}
            >
              Архив
            </button>
          </div>

          {/* Region filter capsule */}
          <div className={styles.filterCapsule}>
            {availableRegions.map((region) => (
              <button
                key={region}
                className={`${styles.filterBtn} ${activeRegion === region ? styles.active : ""}`}
                onClick={() => setActiveRegion(region)}
              >
                {region}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className={styles.searchWrapper}>
            <div className={styles.searchBox}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Поиск"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Admin / user info */}
          <div className={styles.adminWrapper}>
            {!showLogout && (
              <span className={styles.adminText}>
                {isAdmin ? "Админ" : userInfo?.email || ""}
              </span>
            )}
            {showLogout && (
              <button className={styles.logoutModule} onClick={handleLogout}>
                Выйти
              </button>
            )}
            <div
              className={styles.avatar}
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setShowLogout((v) => !v); }}
              onKeyDown={(e) => { if (e.key === "Enter") setShowLogout((v) => !v); }}
            >
              👤
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Error */}
        {error && <div className={styles.errorMsg}>{error}</div>}

        {/* Loading */}
        {loading && (
          <div className={styles.emptyState}>Загрузка...</div>
        )}

        {/* Cars grid */}
        {!loading && filteredCars.length === 0 && (
          <div className={styles.emptyState}>Нет автомобилей</div>
        )}

        {!loading && filteredCars.length > 0 && (
          <div className={styles.carsGrid}>
            {filteredCars.map((car) => {
              const total = 14;
              const locked = car.locked_slots || 0;
              const pct = Math.round((locked / total) * 100);

              return (
                <Link
                  key={car.id}
                  href={`/cars/${car.vin}`}
                  className={styles.carCard}
                >
                  <div className={styles.carVin}>
                    <span className={styles.carVinPrefix}>VIN:</span>
                    {car.vin}
                  </div>

                  <div className={styles.carInfoText}>
                    {car.make} {car.model}, {car.region}
                  </div>

                  <div className={styles.photoProgress}>
                    <div className={styles.progressHeader}>
                      <span>Загружено слотов</span>
                      <span className={styles.photoCount}>{locked}/{total}</span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={styles.progressBarFill}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* New car button for admins */}
        {isAdmin && activeStatus === "actual" && activeRegion && (
          <div className={styles.fabWrapper}>
            <Link
              href={`/cars/new?region=${activeRegion}`}
              className={styles.fabButton}
            >
              + Новый автомобиль
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
