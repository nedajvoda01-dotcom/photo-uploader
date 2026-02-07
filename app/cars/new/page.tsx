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
  
  // Get region from query parameter (passed from cars page)
  const region = searchParams.get("region") || "";

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

      if (!response.ok) {
        if (response.status === 409) {
          setError("A car with this VIN already exists in your region");
        } else if (response.status === 401) {
          router.push("/login");
          return;
        } else {
          setError(data.error || "Failed to create car");
        }
        setLoading(false);
        return;
      }

      // Success - redirect to car details
      router.push(`/cars/${data.car.vin}`);
    } catch (err) {
      console.error("Error creating car:", err);
      setError("An error occurred. Please try again.");
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
          </div>

          <h1 className={styles.title}>Add New Car</h1>
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
                disabled={loading || vin.length !== 17}
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
