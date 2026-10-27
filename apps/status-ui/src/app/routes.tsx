import { Route, Routes } from "react-router-dom";
import { Deal } from "../pages/Deal";
import { Judges } from "../pages/Judges";
import { NotFound } from "../pages/NotFound";
import { Overview } from "../pages/Overview";
import { Proof } from "../pages/Proof";
import { Receipt } from "../pages/Receipt";
import { Replay } from "../pages/Replay";
import { Verify } from "../pages/Verify";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/deal/:id" element={<Deal />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/verify/:dealId" element={<Verify />} />
      <Route path="/proof" element={<Proof />} />
      <Route path="/receipt/:id" element={<Receipt />} />
      <Route path="/judges" element={<Judges />} />
      <Route path="/replay" element={<Replay />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
