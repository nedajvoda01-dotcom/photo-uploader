"use client";

import { useState, FormEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const removeErrorState = () => {
    setError("");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    removeErrorState();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: login, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Неверный логин или пароль.");
        loginRef.current?.classList.add(styles.inputError);
        passwordRef.current?.classList.add(styles.inputError);
        setLoading(false);
        return;
      }

      router.push("/cars");
    } catch {
      setError("Произошла ошибка. Попробуйте ещё раз.");
      setLoading(false);
    }
  };

  const handleChange = () => {
    if (error) {
      removeErrorState();
      loginRef.current?.classList.remove(styles.inputError);
      passwordRef.current?.classList.remove(styles.inputError);
    }
  };

  return (
    <div className={styles.body}>
      <div className={styles.loginCard}>
        <form onSubmit={handleSubmit}>
          <input
            ref={loginRef}
            type="text"
            className={`${styles.inputField} ${styles.loginField}`}
            placeholder="Логин"
            value={login}
            onChange={(e) => { setLogin(e.target.value); handleChange(); }}
            autoComplete="off"
            inputMode="text"
            disabled={loading}
            required
          />
          <input
            ref={passwordRef}
            type="password"
            className={`${styles.inputField} ${styles.passwordField}`}
            placeholder="Пароль"
            value={password}
            onChange={(e) => { setPassword(e.target.value); handleChange(); }}
            autoComplete="off"
            disabled={loading}
            required
          />

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className={styles.loginButton}
            disabled={loading}
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
