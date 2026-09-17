"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

export const ROLES = ["ADMIN", "VENDEDOR", "CONTADOR"];

const USUARIO_INICIAL = {
  id: "usr_01",
  nombre: "Omar Soto",
  rol: "ADMIN",
  sucursalId: "Cabimas - Principal",
  cajaActivaId: "caja_01",
};

const UserContext = createContext();

export function UserProvider({ children }) {
  const [usuario, setUsuario] = useState(USUARIO_INICIAL);

  useEffect(() => {
    const cache = localStorage.getItem("duna_auth_user");
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap desde localStorage, solo disponible post-montaje en cliente
        setUsuario(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn("No se pudo leer la sesión guardada, usando sesión por defecto.");
      }
    }
  }, []);

  const actualizarUsuario = (datos) => {
    setUsuario(prev => {
      const nuevo = { ...prev, ...datos };
      localStorage.setItem("duna_auth_user", JSON.stringify(nuevo));
      return nuevo;
    });
  };

  const cambiarRol = (rol) => actualizarUsuario({ rol });

  const value = {
    usuario,
    actualizarUsuario,
    cambiarRol,
    esAdmin: usuario.rol === "ADMIN",
    esVendedor: usuario.rol === "VENDEDOR",
    esContador: usuario.rol === "CONTADOR",
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
