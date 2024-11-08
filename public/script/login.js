// Get elements
const modal = document.getElementById('popupForm');
const loginBtn = document.getElementById('loginBtn');
const closeBtn = document.getElementsByClassName('close')[0];
const showRegisterForm = document.getElementById('showRegisterForm');
const showLoginForm = document.getElementById('showLoginForm');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Function to show the modal with animation
function showModal() {
    modal.style.display = 'block';
    modal.classList.add('fade-in');
}

// Function to hide the modal with animation
function hideModal() {
    modal.classList.add('fade-out');
    setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('fade-in', 'fade-out');
    }, 500); // The timeout should match the CSS animation duration
}

// Show modal on clicking "Login" button
loginBtn.onclick = function () {
    showModal();
}

// Close modal when 'x' is clicked
closeBtn.onclick = function () {
    hideModal();
}

// Switch to Registration Form
showRegisterForm.onclick = function () {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
}

// Switch back to Login Form
showLoginForm.onclick = function () {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
}

// Close modal if clicked outside of form
window.onclick = function (event) {
    if (event.target === modal) {
        hideModal();
    }
}
