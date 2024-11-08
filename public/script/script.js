// script.js

$(document).ready(function() {
    $('.readans button').click(function() {
        $(this).closest('.readans').next('.answer').slideToggle();
    });
});

