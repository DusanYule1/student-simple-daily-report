// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ChangePassword from './components/ChangePassword';
import PersonTimeline from './components/PersonTimeline';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/people/:studentId/reports" element={<PersonTimeline />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/users" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
