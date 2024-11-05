// todo
// src/main.ts

// Create a button element
const button = document.createElement("button");
button.textContent = "Click me";

// Add an event listener to the button
button.addEventListener("click", () => {
  alert("You clicked the button!");
});

// Append the button to the body of the document
document.body.appendChild(button);
