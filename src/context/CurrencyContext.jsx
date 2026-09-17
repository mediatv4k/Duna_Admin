"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [modoMoneda, setModoMoneda] = useState("dual"); // 'dual' | 'usd' | 'ves'
  const [tasaBcv, setTasaBcv] = useState(847.44);
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [ultimaHora, setUltimaHora] = useState("");

  const consultarApiBCV = async () => {
    setCargandoTasa(true);
    try {
      const res = await fetch("https://api.dolaraldiavzla.com/api/v1/dollar?page=bcv&monitor=usd");
      if (res.ok) {
        const json = await res.json();
        const precio = json?.price || json?.data?.price || json?.monitors?.usd?.price || (typeof json === "number" ? json : null);
        if (precio && !isNaN(Number(precio))) {
          const valor = Number(precio);
          const hora = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setTasaBcv(valor);
          setUltimaHora(hora);
          localStorage.setItem("duna_tasa_bcv", JSON.stringify({ valor, hora }));
        }
      }
    } catch (e) {
      console.warn("API de tasas no disponible momentáneamente, usando respaldo en caché.");
    } finally {
      setCargandoTasa(false);
    }
  };

  useEffect(() => {
    const cache = localStorage.getItem("duna_tasa_bcv");
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        if (parsed.valor) setTasaBcv(parsed.valor);
        if (parsed.hora) setUltimaHora(parsed.hora);
      } catch (e) {}
    }
    consultarApiBCV();
  }, []);

  return (
    <CurrencyContext.Provider value={{ modoMoneda, setModoMoneda, tasaBcv, cargandoTasa, ultimaHora, consultarApiBCV }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
