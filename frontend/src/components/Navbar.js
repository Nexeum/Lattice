import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Navbar, Button } from "flowbite-react";

export const NavbarRC = () => {
  const location = useLocation();
  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/nodesly", label: "Nodesly" },
    { to: "/statify", label: "Statify" },
    { to: "/tars", label: "Tars" },
  ];

  return (
    <Navbar rounded>
      <Navbar.Brand href="https://flowbite-react.com">
        <img
          src="https://cdn-icons-png.flaticon.com/128/1344/1344707.png"
          className="mr-3 h-6 sm:h-9"
          alt="Innoxus"
        />
        <span className="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
          Innoxus
        </span>
      </Navbar.Brand>
      <div className="flex md:order-2">
        <Button className="mr-2">API</Button>
        <Navbar.Toggle />
      </div>
      <Navbar.Collapse className="justify-center">
        {navLinks.map((link) => (
          <Navbar.Link
            key={link.to}
            as={Link}
            to={link.to}
            active={location.pathname === link.to}
          >
            {link.label}
          </Navbar.Link>
        ))}
      </Navbar.Collapse>
    </Navbar>
  );
};