import { DeviceStatus } from "../services/deviceService.js";

export type DeviceRegistryEntry = {
  id: string;
  name: string;
  location: string;
  status?: DeviceStatus;
  capacity?: number;
};

export const deviceRegistry: DeviceRegistryEntry[] = [
  {
    id: "PSVG-RNDTEST1",
    name: "프라임 솔루션 ",
    location: "경기도 안양시 동안구 시민대로",
    capacity: 200,
  },
  {
    id: "PSVG-RNDTEST2",
    name: "평촌 스마트베이이",
    location: "경기도 안양시 벌말로 232",
    capacity: 200,
  },
  {
    id: "PSVG-RNDTEST3",
    name: "부산 시청",
    location: "부산광역시 연제구 중앙대로 1001 (부산시청)",
    capacity: 150,
  },
  {
    id: "PSVG-RNDTEST4",
    name: "서울 시청",
    location: "서울특별시 중구 세종대로 110 (서울시청)",
    capacity: 150,
  },
  {
    id: "PSVG-RNDTEST5",
    name: "군산 시청",
    location: "전북특별자치도 군산시 시청로17 (군산시청)",
    capacity: 200,
  },
  {
    id: "PSVG-RNDTEST6",
    name: "제주특별자치도청",
    location: "제주특별자치도 제주시 특별자치도, 문연로 6 (제주도청)",
    capacity: 50,
  },
];