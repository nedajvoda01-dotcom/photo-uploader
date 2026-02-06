"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import styles from "./carDetail.module.css";

interface Car {
  id: number;
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by: number;
  created_at: string;
}

interface CarSlot {
  id: number;
  car_id: number;
  slot_type: string;
  slot_index: number;
  status: string;
  locked_at: string | null;
  locked_by: number | null;
  lock_meta_json: string | null;
  disk_slot_path: string;
  public_url: string | null;
}

interface CarLink {
  id: number;
  car_id: number;
  title: string;
  url: string;
  created_by: number;
  created_at: string;
}

interface SlotCardProps {
  slot: CarSlot;
  carId: number;
  onUploadComplete: () => void;
}

function SlotCard({ slot, carId, onUploadComplete }: SlotCardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [loadingShare, setLoadingShare] = useState(false);

  const isLocked = slot.status === "locked";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
    setError("");
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("slotType", slot.slot_type);
      formData.append("slotIndex", slot.slot_index.toString());

      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append(`file${i + 1}`, selectedFiles[i]);
      }

      const response = await fetch(`/api/cars/${carId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError("Slot already filled");
        } else if (response.status === 403) {
          setError("No access (different region)");
        } else {
          setError(data.error || "Upload failed");
        }
        setUploading(false);
        return;
      }

      // Success - refresh the page data
      onUploadComplete();
    } catch (err) {
      console.error("Upload error:", err);
      setError("Upload failed. Please try again.");
      setUploading(false);
    }
  };

  const handleGetShareLink = async () => {
    if (slot.public_url) {
      window.open(slot.public_url, "_blank");
      return;
    }

    setLoadingShare(true);
    try {
      const response = await fetch(
        `/api/cars/${carId}/share?slotType=${slot.slot_type}&slotIndex=${slot.slot_index}`
      );

      if (response.ok) {
        const data = await response.json();
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Error getting share link:", err);
    } finally {
      setLoadingShare(false);
    }
  };

  const lockMeta = slot.lock_meta_json ? JSON.parse(slot.lock_meta_json) : null;

  return (
    <div className={`${styles.slotCard} ${isLocked ? styles.slotLocked : styles.slotEmpty}`}>
      <div className={styles.slotHeader}>
        <span className={styles.slotIndex}>Slot {slot.slot_index}</span>
        <span className={`${styles.slotStatus} ${isLocked ? styles.statusLocked : styles.statusEmpty}`}>
          {isLocked ? "Filled" : "Empty"}
        </span>
      </div>

      {isLocked ? (
        <div className={styles.lockedContent}>
          {lockMeta && (
            <div className={styles.lockInfo}>
              <p className={styles.lockDetail}>
                Files: {lockMeta.fileCount}
              </p>
              <p className={styles.lockDetail}>
                Uploaded: {new Date(lockMeta.uploadedAt).toLocaleDateString()}
              </p>
            </div>
          )}
          <button
            onClick={handleGetShareLink}
            className={styles.shareButton}
            disabled={loadingShare}
          >
            {loadingShare ? "Loading..." : "Get Link"}
          </button>
        </div>
      ) : (
        <div className={styles.emptyContent}>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className={styles.fileInput}
            disabled={uploading}
          />
          {selectedFiles && selectedFiles.length > 0 && (
            <p className={styles.selectedInfo}>
              {selectedFiles.length} file(s) selected
            </p>
          )}
          {error && <p className={styles.slotError}>{error}</p>}
          <button
            onClick={handleUpload}
            className={styles.uploadButton}
            disabled={uploading || !selectedFiles || selectedFiles.length === 0}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CarDetailPage() {
  const router = useRouter();
  const params = useParams();
  const carId = params.id as string;

  const [car, setCar] = useState<Car | null>(null);
  const [slots, setSlots] = useState<CarSlot[]>([]);
  const [links, setLinks] = useState<CarLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  useEffect(() => {
    if (carId) {
      fetchCarData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  const fetchCarData = async () => {
    try {
      const response = await fetch(`/api/cars/${carId}`);

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (response.status === 403) {
          setError("Access denied - different region");
          setLoading(false);
          return;
        }
        throw new Error("Failed to fetch car data");
      }

      const data = await response.json();
      setCar(data.car);
      setSlots(data.slots || []);
      setLinks(data.links || []);
    } catch (err) {
      console.error("Error fetching car:", err);
      setError("Failed to load car data");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = async () => {
    if (!newLinkTitle || !newLinkUrl) return;

    setAddingLink(true);
    try {
      const response = await fetch(`/api/cars/${carId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl }),
      });

      if (response.ok) {
        setNewLinkTitle("");
        setNewLinkUrl("");
        fetchCarData();
      }
    } catch (err) {
      console.error("Error adding link:", err);
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    try {
      await fetch(`/api/links/${linkId}`, { method: "DELETE" });
      fetchCarData();
    } catch (err) {
      console.error("Error deleting link:", err);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading car data...</div>
      </div>
    );
  }

  if (error || !car) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.error}>{error || "Car not found"}</div>
          <Link href="/cars" className={styles.backLink}>
            ← Back to Cars
          </Link>
        </div>
      </div>
    );
  }

  const dealerSlots = slots.filter((s) => s.slot_type === "dealer");
  const buyoutSlots = slots.filter((s) => s.slot_type === "buyout");
  const dummiesSlots = slots.filter((s) => s.slot_type === "dummies");

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerBar}>
          <Link href="/cars" className={styles.backLink}>
            ← Back to Cars
          </Link>
        </div>

        <div className={styles.carHeader}>
          <h1 className={styles.carTitle}>
            {car.make} {car.model}
          </h1>
          <p className={styles.carVin}>VIN: {car.vin}</p>
        </div>

        <div className={styles.linksSection}>
          <h2 className={styles.sectionTitle}>External Links</h2>
          <div className={styles.linksList}>
            {links.map((link) => (
              <div key={link.id} className={styles.linkItem}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.linkUrl}>
                  {link.title}
                </a>
                <button onClick={() => handleDeleteLink(link.id)} className={styles.deleteLinkButton}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className={styles.addLinkForm}>
            <input
              type="text"
              placeholder="Link title"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
              className={styles.linkInput}
            />
            <input
              type="url"
              placeholder="URL"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              className={styles.linkInput}
            />
            <button onClick={handleAddLink} disabled={addingLink} className={styles.addLinkButton}>
              {addingLink ? "Adding..." : "Add Link"}
            </button>
          </div>
        </div>

        <div className={styles.slotsSection}>
          <h2 className={styles.sectionTitle}>Dealer Photos (1 slot)</h2>
          <div className={styles.slotGrid}>
            {dealerSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} carId={parseInt(carId)} onUploadComplete={fetchCarData} />
            ))}
          </div>
        </div>

        <div className={styles.slotsSection}>
          <h2 className={styles.sectionTitle}>Buyout Photos (8 slots)</h2>
          <div className={styles.slotGrid}>
            {buyoutSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} carId={parseInt(carId)} onUploadComplete={fetchCarData} />
            ))}
          </div>
        </div>

        <div className={styles.slotsSection}>
          <h2 className={styles.sectionTitle}>Dummies Photos (5 slots)</h2>
          <div className={styles.slotGrid}>
            {dummiesSlots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} carId={parseInt(carId)} onUploadComplete={fetchCarData} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
