"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

export const PERFILES_NEGOCIO = ["SIMPLE", "RETAIL", "GASTRONOMIA", "FARMACIA"];

const BusinessProfileContext = createContext();

export function BusinessProfileProvider({ children }) {
  const [perfil, setPerfilState] = useState("RETAIL");

  useEffect(() => {
    const cache = localStorage.getItem("duna_business_profile");
    if (cache && PERFILES_NEGOCIO.includes(cache)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
      setPerfilState(cache);
    }
  }, []);

  const setPerfil = (nuevo) => {
    setPerfilState(nuevo);
    localStorage.setItem("duna_business_profile", nuevo);
  };

  return (
    <BusinessProfileContext.Provider value={{ perfil, setPerfil }}>
      {children}
    </BusinessProfileContext.Provider>
  );
}

export const useBusinessProfile = () => useContext(BusinessProfileContext);
