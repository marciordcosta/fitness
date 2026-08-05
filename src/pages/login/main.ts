import { mount } from "svelte";
import "../../styles/tokens.css";
import Login from "./Login.svelte";

mount(Login, { target: document.getElementById("app")! });
