import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const parseInstagramUrl = (url) =>
  client.post("/instagram/parse", { url }).then((r) => r.data);
export const listUsers = () => client.get("/users").then((r) => r.data);
export const addUser = (p) => client.post("/users", p).then((r) => r.data);
export const updateUser = (id, p) => client.put(`/users/${id}`, p).then((r) => r.data);
export const deleteUser = (id) => client.delete(`/users/${id}`).then((r) => r.data);
export const listCategories = () => client.get("/categories").then((r) => r.data);
export const exportUrl = (kind) => `${API}/export/${kind}`;
