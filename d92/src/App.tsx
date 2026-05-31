import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Upload from "@/pages/Upload";
import SkyMap from "@/pages/SkyMap";
import DataList from "@/pages/DataList";
import DataDetail from "@/pages/DataDetail";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/sky-map" element={<SkyMap />} />
          <Route path="/data" element={<DataList />} />
          <Route path="/data/:id" element={<DataDetail />} />
        </Route>
      </Routes>
    </Router>
  );
}
