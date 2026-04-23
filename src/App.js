import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './Components/Layout';
import Homepage from './Pages/Homepage';
import Cv from './Pages/Cv';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <Homepage />
          </Layout>
        }
      />
      <Route
        path="/cv"
        element={
          <Layout>
            <Cv />
          </Layout>
        }
      />
    </Routes>
  );
}
