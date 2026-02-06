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

export default function CarsPage() {
  const router = useRouter();
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCars = async () => {
    try {
      const response = await fetch("/api/cars");
      
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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>My Cars</h1>
          <div className={styles.headerActions}>
            <Link href="/cars/new" className={styles.newButton}>
              + New Car
            </Link>
            <button onClick={handleLogout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        </header>

        {error && <div className={styles.error}>{error}</div>}

        {cars.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No cars yet.</p>
            <p className={styles.emptySubtext}>
              Click &quot;+ New Car&quot; to add your first car.
            </p>
          </div>
        ) : (
          <div className={styles.carsList}>
            {cars.map((car) => {
              const progress = calculateProgress(car);
              const breakdown = getBreakdown(car);

              return (
                <div key={car.id} className={styles.carCard}>
                  <div className={styles.carInfo}>
                    <h2 className={styles.carTitle}>
                      {car.make} {car.model}
                    </h2>
                    <p className={styles.carVin}>VIN: {car.vin}</p>
                  </div>

                  <div className={styles.progressSection}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className={styles.progressText}>{progress}% Complete</p>
                  </div>

                  <div className={styles.breakdown}>
                    <span className={styles.breakdownItem}>
                      Dealer: {breakdown.dealer}/1
                    </span>
                    <span className={styles.breakdownItem}>
                      Buyout: {breakdown.buyout}/8
                    </span>
                    <span className={styles.breakdownItem}>
                      Dummies: {breakdown.dummies}/5
                    </span>
                  </div>

                  <Link
                    href={`/cars/${car.id}`}
                    className={styles.openButton}
                  >
                    Open
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
