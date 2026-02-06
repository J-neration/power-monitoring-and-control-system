import { DeviceStatus } from "../services/deviceService.js";

export type DeviceRegistryEntry = {
  id: string;
  name: string;
  location: string;
  status?: DeviceStatus;
};

export const deviceRegistry: DeviceRegistryEntry[] = [
  {
    id: "HMI-1",
    name: "HMI Matrix A",
    location: "Rack 1",
    status: "online",
  },
  {
    id: "HMI-2",
    name: "Capture Node 3",
    location: "Studio 2",
    status: "warning",
  },
  {
    id: "HMI-3",
    name: "Control Room A",
    location: "Rack 1",
    status: "online",
  },
  {
    id: "HMI-4",
    name: "Capture Node 7",
    location: "Studio 2",
    status: "offline",
  },
  {
    id: "HMI-5",
    name: "Power Gateway 1",
    location: "Rack 1",
    status: "online",
  },
  {
    id: "HMI-6",
    name: "Power Gateway 2",
    location: "Rack 1",
    status: "online",
  },
  {
    id: "HMI-7",
    name: "Panel Controller 1",
    location: "Rack 1",
    status: "warning",
  },
  {
    id: "HMI-8",
    name: "Panel Controller 2",
    location: "Rack 1",
    status: "offline",
  },
  {
    id: "PSVG-RNDTEST1",
    name: "R&D Test Unit",
    location: "Prime Solution",
  },
  {
    id: "PSVG-RNDTEST2",
    name: "R&D Test Unit",
    location: "Prime Solution",
  },
];
