"use client";

import { useEffect, useState } from "react";
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
  const [activeRegion, setActiveRegion] = useState<string>("");
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);

  useEffect(() => {
    fetchAvailableRegions();
    fetchUserInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeRegion) {
      fetchCars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion]);

  const fetchAvailableRegions = async () => {
    try {
      const response = await fetch("/api/config/regions");
      if (response.ok) {
        const data = await response.json();
        setAvailableRegions(data.regions || []);
      }
    } catch (err) {
      console.error("Error fetching regions:", err);
      // Fallback to hardcoded list if API fails
      setAvailableRegions(["R1", "R2", "R3", "K1", "V", "S1", "S2"]);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const response = await fetch("/api/me");
      if (response.ok) {
        const data = await response.json();
        setUserInfo(data);
        // Set initial active region
        if (data.role === "admin") {
          // Admin: default to first region if region is ALL
          // Wait for availableRegions to be loaded
          if (data.region === "ALL" && availableRegions.length > 0) {
            setActiveRegion(availableRegions[0]);
          } else if (data.region !== "ALL") {
            setActiveRegion(data.region);
          }
        } else {
          // User: use their assigned region
          setActiveRegion(data.region);
        }
      } else if (response.status === 401) {
        router.push("/login");
      }
    } catch (err) {
      console.error("Error fetching user info:", err);
    }
  };

  // Set default region for admin once availableRegions is loaded
  useEffect(() => {
    if (userInfo?.role === "admin" && userInfo.region === "ALL" && availableRegions.length > 0 && !activeRegion) {
      setActiveRegion(availableRegions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRegions, userInfo]);

  const fetchCars = async () => {
    if (!activeRegion) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/cars?region=${activeRegion}`);
      
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch cars");
      }

      const data = await response.json();
      setCars(data.cars || []);
    } catch (err) {
      console.error("Error fetching cars:", err);
      setError("Failed to load cars. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const calculateProgress = (car: Car) => {
    const total = 14;
    const locked = car.locked_slots || 0;
    return Math.round((locked / total) * 100);
  };

  const getBreakdown = (car: Car) => {
    // For now, we'll calculate based on total locked slots
    // In a real scenario, we'd need slot_type breakdown from the API
    // This is a simplified version
    return {
      dealer: car.locked_slots > 0 ? 1 : 0,
      buyout: Math.min(Math.max(car.locked_slots - 1, 0), 8),
      dummies: Math.max(car.locked_slots - 9, 0),
    };
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>Loading cars...</div>
        </div>
      </div>
    );
  }

  const isAdmin = userInfo?.role === "admin";

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Top Bar with User Info */}
        <div className={styles.topBar}>
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{userInfo?.email || 'User'}</span>
            <span className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : styles.rolePhotographer}`}>
              {isAdmin ? '👑 Admin' : '📷 Photographer'}
            </span>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>
            Logout
          </button>
        </div>

        <header className={styles.header}>
          <div className={styles.titleSection}>
            <h1 className={styles.title}>Cars Dashboard</h1>
            {isAdmin && activeRegion && (
              <div className={styles.regionSelectorWrapper}>
                <label htmlFor="region-select" className={styles.regionLabel}>
                  Active Region:
                </label>
                <select
                  id="region-select"
                  value={activeRegion}
                  onChange={(e) => setActiveRegion(e.target.value)}
                  className={styles.regionSelect}
                >
                  {availableRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
                <div className={styles.regionNote}>
                  ALL is archive only, not for actions
                </div>
              </div>
            )}
            {!isAdmin && userInfo && (
              <div className={styles.regionInfo}>
                <span className={styles.regionLabel}>Your Region:</span>
                <span className={styles.regionBadge}>{userInfo.region}</span>
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            {activeRegion ? (
              <Link 
                href={`/cars/new?region=${activeRegion}`} 
                className={styles.newButton}
              >
                + New Car
              </Link>
            ) : (
              <button className={styles.newButtonDisabled} disabled title="Select a region first">
                + New Car (Select Region)
              </button>
            )}
          </div>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        {/* Stats Bar */}
        {activeRegion && (
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Region:</span>
              <span className={styles.statValue}>{activeRegion}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total Cars:</span>
              <span className={styles.statValue}>{cars.length}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Completed:</span>
              <span className={styles.statValue}>
                {cars.filter(c => calculateProgress(c) === 100).length}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>In Progress:</span>
              <span className={styles.statValue}>
                {cars.filter(c => calculateProgress(c) > 0 && calculateProgress(c) < 100).length}
              </span>
            </div>
          </div>
        )}

        {cars.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🚗</div>
            <p className={styles.emptyText}>No cars in {activeRegion || 'this region'}</p>
            <p className={styles.emptySubtext}>
              {isAdmin 
                ? `Create a new car in ${activeRegion} to get started.` 
                : 'Click "+ New Car" to add your first car.'
              }
            </p>
          </div>
        ) : (
          <div className={styles.carsList}>
            {cars.map((car) => {
              const progress = calculateProgress(car);
              const breakdown = getBreakdown(car);

              return (
                <div key={car.id} className={styles.carCard}>
                  <div className={styles.carHeader}>
                    <div className={styles.carInfo}>
                      <h2 className={styles.carTitle}>
                        {car.make} {car.model}
                      </h2>
                      <p className={styles.carVin}>VIN: {car.vin}</p>
                    </div>
                    <div className={styles.carRegionBadge}>{car.region}</div>
                  </div>

                  <div className={styles.progressSection}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressLabel}>Upload Progress</span>
                      <span className={styles.progressPercent}>{progress}%</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div
                        className={`${styles.progressFill} ${progress === 100 ? styles.progressComplete : ''}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className={styles.breakdown}>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Dealer</span>
                      <span className={styles.breakdownValue}>{breakdown.dealer}/1</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Buyout</span>
                      <span className={styles.breakdownValue}>{breakdown.buyout}/8</span>
                    </div>
                    <div className={styles.breakdownItem}>
                      <span className={styles.breakdownLabel}>Dummies</span>
                      <span className={styles.breakdownValue}>{breakdown.dummies}/5</span>
                    </div>
                  </div>

                  <Link
                    href={`/cars/${car.vin}`}
                    className={styles.openButton}
                  >
                    Open Car →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
