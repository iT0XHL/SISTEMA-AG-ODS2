import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PageHead, Skeleton } from "./components/ui";
import { AuthProvider, useAuth } from "./features/auth";
import { StoreProvider } from "./features/store";
import { ConfigPage } from "./pages/ConfigPage";
import { FourRunsPage } from "./pages/FourRunsPage";
import { GlossaryPage } from "./pages/GlossaryPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ResultsPage } from "./pages/ResultsPage";
import { RunPage } from "./pages/RunPage";
import { ScenarioPage } from "./pages/ScenarioPage";

function NotFound() {
  return (
    <>
      <PageHead step="Error 404" title="Página no encontrada">
        La dirección no corresponde a ninguna sección de NutriRuta AG.
      </PageHead>
      <Link className="btn primary" to="/" style={{ alignSelf: "flex-start" }}>
        Volver al inicio
      </Link>
    </>
  );
}

function Gate() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="boot">
        <Skeleton height={96} label="Comprobando la sesión" />
      </div>
    );
  }
  if (status === "anon") return <LoginPage />;
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="escenario" element={<ScenarioPage />} />
            <Route path="configuracion" element={<ConfigPage />} />
            <Route path="ejecucion" element={<RunPage />} />
            <Route path="resultados" element={<ResultsPage />} />
            <Route path="cuatro-corridas" element={<FourRunsPage />} />
            <Route path="glosario" element={<GlossaryPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
