import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { UserProvider } from "@/context/UserContext";
import { BusinessProfileProvider } from "@/context/BusinessProfileContext";
import CintilloTop from "@/components/CintilloTop";
import ManualDrawer from "@/components/ManualDrawer";
import AuthGate from "@/components/AuthGate";

export const metadata = {
  title: "D'una Admin - Plataforma de Gestión Comercial",
  description: "Sistema SaaS administrativo multi-tienda de D'una Marketplace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <UserProvider>
            <BusinessProfileProvider>
              <CurrencyProvider>
                <CintilloTop />
                <AuthGate>{children}</AuthGate>
                <ManualDrawer />
              </CurrencyProvider>
            </BusinessProfileProvider>
          </UserProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
