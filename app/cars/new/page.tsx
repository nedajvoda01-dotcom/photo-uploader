"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./new.module.css";

function NewCarForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vin, setVin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<{role: string; region: string; email: string} | null>(null);
  
  // Get region from query parameter (passed from cars page)
  const region = searchParams.get("region") || "";

  const fetchUserInfo = async () => {
    try {
      const response = await fetch("/api/me");
      if (response.ok) {
        const data = await response.json();
        setUserInfo(data);
      }
    } catch (err) {
      console.error("Error fetching user info:", err);
    }
  };

  useEffect(() => {
    // Fetch user info on mount to display role badge
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUserInfo();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate VIN
    if (vin.length !== 17) {
      setError("VIN must be exactly 17 characters");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/cars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          make, 
          model, 
          vin: vin.toUpperCase(),
          region: region || undefined, // Include region for admins
        }),
      });

      const data = await response.json();

      // Handle new standardized response format
      if (data.ok === false) {
        // Error response with detailed information
        const errorMessage = data.message || "Failed to create car";
        const errorCode = data.code ? ` (${data.code})` : "";
        const statusCode = data.status || response.status;
        
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        
        setError(`Error ${statusCode}: ${errorMessage}${errorCode}`);
        setLoading(false);
        return;
      }

      // Success - handle both new creation (201) and existing car (200)
      if (data.ok === true && data.car) {
        const carVin = data.car.vin;
        console.log(`Car ${response.status === 201 ? 'created' : 'already exists'}: ${carVin}`);
        // Redirect to car details page
        router.push(`/cars/${carVin}`);
        return;
      }

      // Legacy response format support (success: true)
      if (data.success && data.car) {
        router.push(`/cars/${data.car.vin}`);
        return;
      }

      // Fallback for unexpected response format
      if (!response.ok) {
        setError(data.error || `Error ${response.status}: Failed to create car`);
        setLoading(false);
        return;
      }

    } catch (err) {
      console.error("Error creating car:", err);
      setError("Network error: Unable to connect to the server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Link href="/cars" className={styles.backButton}>
              ← Back to Cars
            </Link>
            {userInfo && (
              <div className={styles.userBadge}>
                <span className={`${styles.roleBadge} ${userInfo.role === 'admin' ? styles.roleAdmin : styles.rolePhotographer}`}>
                  {userInfo.role === 'admin' ? '👑 Admin' : '📷 Photographer'}
                </span>
              </div>
            )}
          </div>

          <h1 className={styles.title}>Add New Car</h1>
          
          {/* Show target region prominently */}
          {region ? (
            <div className={styles.regionDisplay}>
              <div className={styles.regionLabel}>Creating in region:</div>
              <div className={styles.regionValue}>{region}</div>
              {userInfo?.role === 'admin' && (
                <div className={styles.regionNote}>
                  ✓ Admin creating car in selected active region
                </div>
              )}
              {userInfo?.role === 'user' && (
                <div className={styles.regionNote}>
                  ✓ Creating car in your assigned region
                </div>
              )}
            </div>
          ) : (
            <div className={styles.regionWarning}>
              ⚠️ No region selected. Please go back and select a region first.
            </div>
          )}

          <p className={styles.subtitle}>
            Enter the car details to start uploading photos
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="make" className={styles.label}>
                Make <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                required
                className={styles.input}
                placeholder="Toyota"
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="model" className={styles.label}>
                Model <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                className={styles.input}
                placeholder="Camry"
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="vin" className={styles.label}>
                VIN (17 characters) <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                required
                maxLength={17}
                className={styles.input}
                placeholder="1HGBH41JXMN109186"
                disabled={loading}
                style={{ fontFamily: "monospace" }}
              />
              <p className={styles.hint}>
                {vin.length}/17 characters
              </p>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <Link href="/cars" className={styles.cancelButton}>
                Cancel
              </Link>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || vin.length !== 17 || !region}
              >
                {loading ? "Creating..." : "Create Car"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function NewCarPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
      <NewCarForm />
    </Suspense>
  );
}
