import { Routes, Route } from "react-router-dom";
import { Login } from './app/Login'
import { Room } from "./app/Room";
import { Rooms } from './app/Rooms'

export const Router = () => {

    return (
    
     <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="rooms" element={<Rooms/>} />
      </Routes>)
}