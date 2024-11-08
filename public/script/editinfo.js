// Get the button and form
const editButton = document.getElementById('editButton');
const editForm = document.getElementById('editForm');

// Add event listener to the button
editButton.addEventListener('click', function() {
    // Toggle the form's visibility and sliding effect
    if (editForm.classList.contains('show')) {
        editForm.classList.remove('show');
    } else {
        editForm.classList.add('show');
    }
});
