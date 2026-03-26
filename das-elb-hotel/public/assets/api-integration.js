(function () {
  window.__dasElbIntegrationReady = false;
  var API_BASE_URL = String(window.API_BASE_URL || "http://localhost:8000/api").replace(/\/+$/, "");
  var HOTEL_PROPERTY_ID = Number(window.HOTEL_PROPERTY_ID || 546) || 546;
  var RESTAURANT_ID = Number(window.RESTAURANT_ID || 4240) || 4240;
  var originalFetch = window.fetch.bind(window);
  var originalOpen = typeof window.open === "function" ? window.open.bind(window) : null;
  var pendingFrontendError = null;
  var roomPriceByCategory = new Map();
  var observer = null;

  function createIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "das-elb-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function createHandledError(message) {
    var error = new Error(message || "__DAS_ELB_FORM_ERROR__");
    error.__dasElbHandled = true;
    return error;
  }

  function setPendingFrontendError(message) {
    pendingFrontendError = message || "Something went wrong";
  }

  function clearPendingFrontendError() {
    pendingFrontendError = null;
  }

  function safeString(value) {
    if (value == null) {
      return "";
    }
    return String(value).trim();
  }

  function safeJsonParse(value) {
    if (typeof value !== "string" || !value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  function responseMessage(status, payload) {
    var detail = payload && typeof payload.detail === "string" ? payload.detail : "";
    if (status === 409) {
      return "Not available";
    }
    if (status === 400) {
      return "Invalid input";
    }
    if (detail) {
      return detail;
    }
    return "Something went wrong";
  }

  function normalizeTime(value, fallback) {
    var timeValue = safeString(value) || fallback || "19:00";
    if (/^\d{2}:\d{2}$/.test(timeValue)) {
      return timeValue + ":00";
    }
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
      return timeValue;
    }
    return (fallback || "19:00") + ":00";
  }

  function normalizePositiveInteger(value, fallback) {
    var parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }

  function normalizeNonNegativeInteger(value, fallback) {
    var parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return fallback;
  }

  function canonicalRoomLabel(value) {
    var normalized = safeString(value).toLowerCase();
    if (normalized.indexOf("suite") !== -1) {
      return "Suite";
    }
    if (normalized.indexOf("plus") !== -1 || normalized.indexOf("deluxe") !== -1 || normalized.indexOf("river") !== -1) {
      return "Komfort Plus";
    }
    if (normalized.indexOf("4") !== -1 && normalized.indexOf("pax") !== -1) {
      return "4 PAX";
    }
    return "Komfort";
  }

  function roomCategoryKey(value) {
    var normalized = safeString(value).toLowerCase();
    if (normalized.indexOf("suite") !== -1) {
      return "suite";
    }
    if (normalized.indexOf("plus") !== -1 || normalized.indexOf("deluxe") !== -1 || normalized.indexOf("river") !== -1) {
      return "komfort_plus";
    }
    if (normalized.indexOf("4") !== -1 && normalized.indexOf("pax") !== -1) {
      return "4_pax";
    }
    return "komfort";
  }

  function legacyRoomMetaFromCategory(categoryKey) {
    if (categoryKey === "suite") {
      return {
        room_type: "suite",
        name: "Suite Deluxe",
        fallbackPrice: 199,
      };
    }
    if (categoryKey === "komfort_plus") {
      return {
        room_type: "komfort plus",
        name: "Komfort Plus Apartment",
        fallbackPrice: 129,
      };
    }
    if (categoryKey === "4_pax") {
      return {
        room_type: "4 pax",
        name: "4 PAX",
        fallbackPrice: 159,
      };
    }
    return {
      room_type: "komfort",
      name: "Komfort Apartment",
      fallbackPrice: 89,
    };
  }

  function roomPriceForCategory(categoryKey) {
    return roomPriceByCategory.get(categoryKey) || legacyRoomMetaFromCategory(categoryKey).fallbackPrice;
  }

  async function safeJsonResponse(response) {
    try {
      return await response.clone().json();
    } catch (_error) {
      return null;
    }
  }

  function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  function buildRestaurantPayload(legacyPayload) {
    return {
      kind: "restaurant",
      restaurant_id: RESTAURANT_ID,
      guest_name: safeString(legacyPayload && legacyPayload.name) || "Guest",
      guest_email: safeString(legacyPayload && legacyPayload.email) || null,
      guest_phone: safeString(legacyPayload && legacyPayload.phone) || null,
      party_size: normalizePositiveInteger(legacyPayload && legacyPayload.persons, 1),
      reservation_date: safeString(legacyPayload && legacyPayload.date) || new Date().toISOString().slice(0, 10),
      start_time: normalizeTime(legacyPayload && legacyPayload.time, "19:00"),
      special_requests: safeString(legacyPayload && legacyPayload.specialRequests) || null,
      source: "web",
    };
  }

  function buildHotelPayload(legacyPayload) {
    var legacyGuestCount = normalizePositiveInteger(legacyPayload && legacyPayload.guest_count, 1);
    var adults = legacyPayload && legacyPayload.adults != null
      ? normalizePositiveInteger(legacyPayload.adults, legacyGuestCount)
      : legacyGuestCount;
    var children = legacyPayload && legacyPayload.children != null
      ? normalizeNonNegativeInteger(legacyPayload.children, 0)
      : 0;

    return {
      kind: "hotel",
      property_id: HOTEL_PROPERTY_ID,
      guest_name: safeString(legacyPayload && legacyPayload.guest_name) || safeString(legacyPayload && legacyPayload.name) || "Guest",
      guest_email: safeString(legacyPayload && legacyPayload.guest_email) || safeString(legacyPayload && legacyPayload.email) || null,
      guest_phone: safeString(legacyPayload && legacyPayload.guest_phone) || safeString(legacyPayload && legacyPayload.phone) || null,
      phone: safeString(legacyPayload && legacyPayload.guest_phone) || safeString(legacyPayload && legacyPayload.phone) || null,
      room_type_label: canonicalRoomLabel(legacyPayload && (legacyPayload.room_type || legacyPayload.roomType)),
      check_in: safeString(legacyPayload && legacyPayload.check_in) || safeString(legacyPayload && legacyPayload.checkIn),
      check_out: safeString(legacyPayload && legacyPayload.check_out) || safeString(legacyPayload && legacyPayload.checkOut),
      adults: adults,
      children: children,
      special_requests: safeString(legacyPayload && legacyPayload.special_requests) || safeString(legacyPayload && legacyPayload.specialRequests) || null,
      source: "web",
    };
  }

  function buildTagungPayload(legacyPayload) {
    var contact = legacyPayload && typeof legacyPayload.contact === "object" ? legacyPayload.contact : {};
    var actualAttendees = normalizePositiveInteger(legacyPayload && legacyPayload.attendees, 1);
    var summaryLines = [
      "Tagung inquiry",
      "Event type: " + (safeString(legacyPayload && legacyPayload.eventType) || "n/a"),
      "Date range: " + (safeString(legacyPayload && legacyPayload.dateStart) || "n/a") + " to " + (safeString(legacyPayload && legacyPayload.dateEnd) || safeString(legacyPayload && legacyPayload.dateStart) || "n/a"),
      "Attendees: " + actualAttendees,
      "Flexibility: " + (safeString(legacyPayload && legacyPayload.flexibility) || "n/a"),
      "Room size: " + (safeString(legacyPayload && legacyPayload.meetingRoomSize) || "n/a"),
      "Accommodation rooms: " + normalizeNonNegativeInteger(legacyPayload && legacyPayload.accommodations, 0),
      "Room preference: " + (safeString(legacyPayload && legacyPayload.roomPreference) || "n/a"),
      "Special requests: " + (safeString(legacyPayload && legacyPayload.specialRequests) || "none"),
      "Accessibility: " + (safeString(legacyPayload && legacyPayload.accessibilityNeeds) || "none"),
      "Budget: " + (safeString(legacyPayload && legacyPayload.budgetRange) || "n/a"),
      "Preferred contact: " + (safeString(contact.preferredContact) || "n/a"),
      "Company: " + (safeString(contact.company) || "n/a"),
    ];

    return {
      kind: "restaurant",
      restaurant_id: RESTAURANT_ID,
      guest_name: safeString(contact.name) || safeString(contact.company) || "Tagung Inquiry",
      guest_email: safeString(contact.email) || null,
      guest_phone: safeString(contact.phone) || null,
      party_size: Math.min(actualAttendees, 100),
      reservation_date: safeString(legacyPayload && legacyPayload.dateStart) || new Date().toISOString().slice(0, 10),
      start_time: "09:00:00",
      special_requests: summaryLines.join("\n").slice(0, 1000),
      notes: ("Requested attendees: " + actualAttendees).slice(0, 1000),
      source: "web",
    };
  }

  function buildEventPayload(legacyPayload) {
    return {
      kind: "restaurant",
      restaurant_id: RESTAURANT_ID,
      guest_name: safeString(legacyPayload && legacyPayload.name) || "Event Guest",
      guest_email: safeString(legacyPayload && legacyPayload.email) || null,
      guest_phone: safeString(legacyPayload && legacyPayload.phone) || null,
      party_size: Math.min(normalizePositiveInteger(legacyPayload && legacyPayload.tickets, 1), 100),
      reservation_date: safeString(legacyPayload && legacyPayload.eventDate) || new Date().toISOString().slice(0, 10),
      start_time: "18:00:00",
      special_requests: [
        "Event booking",
        "Event: " + (safeString(legacyPayload && legacyPayload.eventTitle) || "n/a"),
        "Address: " + (safeString(legacyPayload && legacyPayload.address) || "n/a"),
        "Payment: " + (safeString(legacyPayload && legacyPayload.paymentOption) || "n/a"),
      ].join("\n").slice(0, 1000),
      source: "web",
    };
  }

  function validateRestaurantPayload(payload) {
    if (!safeString(payload.guest_name)) {
      return "Invalid input";
    }
    if (!safeString(payload.reservation_date) || !safeString(payload.start_time) || payload.party_size <= 0) {
      return "Invalid input";
    }
    return null;
  }

  function validateHotelPayload(payload) {
    if (!safeString(payload.guest_name)) {
      return "Invalid input";
    }
    if (!safeString(payload.check_in) || !safeString(payload.check_out) || payload.adults <= 0) {
      return "Invalid input";
    }
    if (new Date(payload.check_out) <= new Date(payload.check_in)) {
      return "Invalid input";
    }
    return null;
  }

  async function fetchCanonicalReservation(payload) {
    return originalFetch(API_BASE_URL + "/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey(),
      },
      body: JSON.stringify(payload),
    });
  }

  async function fetchLocalRoomCatalog() {
    var response = await originalFetch(
      API_BASE_URL + "/public/hotel/rooms?property_id=" + encodeURIComponent(HOTEL_PROPERTY_ID)
    );
    var payload = await safeJsonResponse(response);
    if (!response.ok || !Array.isArray(payload)) {
      return [];
    }

    return payload.map(function (roomType) {
      var category = roomCategoryKey(roomType.room_type || roomType.name);
      var legacyMeta = legacyRoomMetaFromCategory(category);
      roomPriceByCategory.set(category, Number(roomType.base_price || legacyMeta.fallbackPrice));
      return {
        id: roomType.id,
        room_type: legacyMeta.room_type,
        name: legacyMeta.name,
        base_price: Number(roomType.base_price || legacyMeta.fallbackPrice),
        max_occupancy: Number(roomType.max_occupancy || 2),
        room_count: Number(roomType.room_count || 0),
      };
    });
  }

  async function handleHotelRooms() {
    try {
      var roomCatalog = await fetchLocalRoomCatalog();
      return jsonResponse(roomCatalog, 200);
    } catch (_error) {
      return jsonResponse([], 200);
    }
  }

  async function handleHotelAvailability(url) {
    var params = new URL(url, window.location.origin).searchParams;
    var checkIn = safeString(params.get("check_in"));
    var checkOut = safeString(params.get("check_out"));
    var roomType = safeString(params.get("room_type"));
    var adults = normalizePositiveInteger(params.get("adults"), 1);
    var children = normalizeNonNegativeInteger(params.get("children"), 0);
    var category = roomCategoryKey(roomType);
    var basePrice = roomPriceForCategory(category);
    var nights = 0;

    if (checkIn && checkOut) {
      var startDate = new Date(checkIn);
      var endDate = new Date(checkOut);
      if (endDate > startDate) {
        nights = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
      }
    }

    try {
      var availabilityUrl = new URL(API_BASE_URL + "/availability");
      availabilityUrl.searchParams.set("property_id", String(HOTEL_PROPERTY_ID));
      availabilityUrl.searchParams.set("check_in", checkIn);
      availabilityUrl.searchParams.set("check_out", checkOut);
      availabilityUrl.searchParams.set("adults", String(adults));
      availabilityUrl.searchParams.set("children", String(children));

      var response = await originalFetch(availabilityUrl.toString());
      var payload = await safeJsonResponse(response);
      if (!response.ok || !payload) {
        return jsonResponse(
          {
            available: false,
            price: basePrice,
            total_price: basePrice * Math.max(nights, 0),
            message: responseMessage(response.status, payload),
          },
          200
        );
      }

      var matchedRoomType = Array.isArray(payload.room_types)
        ? payload.room_types.find(function (entry) {
            return roomCategoryKey(entry && entry.name) === category;
          })
        : null;

      return jsonResponse(
        {
          available: Boolean(matchedRoomType && matchedRoomType.available_rooms > 0),
          price: basePrice,
          total_price: basePrice * Math.max(nights, 0),
          message: matchedRoomType ? null : "Not available",
        },
        200
      );
    } catch (_error) {
      return jsonResponse(
        {
          available: false,
          price: basePrice,
          total_price: basePrice * Math.max(nights, 0),
          message: "Something went wrong",
        },
        200
      );
    }
  }

  async function handleHotelBooking(requestBody) {
    var payload = buildHotelPayload(requestBody);
    var validationMessage = validateHotelPayload(payload);
    if (validationMessage) {
      return jsonResponse({ success: false, message: validationMessage }, 200);
    }

    try {
      var response = await fetchCanonicalReservation(payload);
      var body = await safeJsonResponse(response);
      if (!response.ok) {
        return jsonResponse(
          { success: false, message: responseMessage(response.status, body) },
          200
        );
      }

      return jsonResponse(
        {
          success: true,
          reference:
            (body && (body.confirmation_code || body.reference || body.booking_id || body.id)) || null,
          confirmation_code:
            (body && (body.confirmation_code || body.reference || body.booking_id)) || null,
          guest_name:
            (body && body.guest_name) || payload.guest_name,
          room_type:
            (body && (body.room_type || body.room_type_label)) || payload.room_type_label,
          total_price:
            (body && (body.total_price || body.total_amount)) || null,
          message:
            (body && body.message) || null,
        },
        200
      );
    } catch (_error) {
      return jsonResponse(
        {
          success: false,
          message: "Something went wrong",
        },
        200
      );
    }
  }

  async function handleRestaurantSubmission(requestBody) {
    var payload = buildRestaurantPayload(requestBody);
    var validationMessage = validateRestaurantPayload(payload);
    if (validationMessage) {
      setPendingFrontendError(validationMessage);
      return Promise.reject(createHandledError(validationMessage));
    }

    try {
      var response = await fetchCanonicalReservation(payload);
      if (response.ok) {
        clearPendingFrontendError();
        return response;
      }

      setPendingFrontendError(responseMessage(response.status, await safeJsonResponse(response)));
      return Promise.reject(createHandledError(pendingFrontendError));
    } catch (_error) {
      if (!pendingFrontendError) {
        setPendingFrontendError("Something went wrong");
      }
      return Promise.reject(createHandledError(pendingFrontendError));
    }
  }

  async function handleTagungSubmission(requestBody) {
    var payload = buildTagungPayload(requestBody);

    try {
      var response = await fetchCanonicalReservation(payload);
      if (response.ok) {
        clearPendingFrontendError();
        return response;
      }

      setPendingFrontendError(responseMessage(response.status, await safeJsonResponse(response)));
      return Promise.reject(createHandledError(pendingFrontendError));
    } catch (_error) {
      if (!pendingFrontendError) {
        setPendingFrontendError("Something went wrong");
      }
      return Promise.reject(createHandledError(pendingFrontendError));
    }
  }

  async function handleEventSubmission(requestBody) {
    var payload = buildEventPayload(requestBody);

    try {
      var response = await fetchCanonicalReservation(payload);
      if (response.ok) {
        clearPendingFrontendError();
        return response;
      }

      setPendingFrontendError(responseMessage(response.status, await safeJsonResponse(response)));
      return Promise.reject(createHandledError(pendingFrontendError));
    } catch (_error) {
      if (!pendingFrontendError) {
        setPendingFrontendError("Something went wrong");
      }
      return Promise.reject(createHandledError(pendingFrontendError));
    }
  }

  function normalizeFetchRequest(input, init) {
    return {
      url: typeof input === "string" ? input : input && input.url ? input.url : String(input),
      init: init || {},
    };
  }

  function isMatchingReservationUrl(url) {
    return /\/api\/reservations\/?$/.test(url) && url.indexOf("gestronomy-api.onrender.com") !== -1;
  }

  function isMatchingTagungenUrl(url) {
    return /\/api\/tagungen\/?$/.test(url) && url.indexOf("gestronomy-api.onrender.com") !== -1;
  }

  function isMatchingEventBookingsUrl(url) {
    return /\/api\/event-bookings\/?$/.test(url) && url.indexOf("gestronomy-api.onrender.com") !== -1;
  }

  function isMatchingHotelRoomsUrl(url) {
    return /\/api\/public\/rooms\/?$/.test(url) || /\/api\/public\/hotel\/rooms\/?$/.test(url);
  }

  function isMatchingHotelAvailabilityUrl(url) {
    return /\/api\/public\/availability\/?/.test(url) || /\/api\/public\/hotel\/availability\/?/.test(url);
  }

  function isMatchingHotelBookingUrl(url) {
    return /\/api\/public\/book\/?$/.test(url) || /\/api\/public\/hotel\/book\/?$/.test(url);
  }

  window.fetch = function (input, init) {
    var request = normalizeFetchRequest(input, init);
    var requestBody = request.init && request.init.body ? safeJsonParse(request.init.body) : null;

    if (isMatchingReservationUrl(request.url)) {
      return handleRestaurantSubmission(requestBody || {});
    }
    if (isMatchingTagungenUrl(request.url)) {
      return handleTagungSubmission(requestBody || {});
    }
    if (isMatchingEventBookingsUrl(request.url)) {
      return handleEventSubmission(requestBody || {});
    }
    if (isMatchingHotelRoomsUrl(request.url)) {
      return handleHotelRooms();
    }
    if (isMatchingHotelAvailabilityUrl(request.url)) {
      return handleHotelAvailability(request.url);
    }
    if (isMatchingHotelBookingUrl(request.url)) {
      return handleHotelBooking(requestBody || {});
    }

    return originalFetch(input, init);
  };

  if (originalOpen) {
    window.open = function (url) {
      if (
        pendingFrontendError &&
        typeof url === "string" &&
        url.indexOf("mailto:rezeption@das-elb.de") === 0
      ) {
        var message = pendingFrontendError;
        clearPendingFrontendError();
        window.alert(message);
        throw createHandledError(message);
      }
      return originalOpen.apply(window, arguments);
    };
  }

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    if (reason && reason.__dasElbHandled) {
      event.preventDefault();
    }
  });

  function annotateControlByLabel(root, labelText, selector, id) {
    if (!root || root.querySelector("#" + id)) {
      return;
    }

    var wrappers = Array.from(root.querySelectorAll("div, section, article, label"));
    var wrapper = wrappers.find(function (node) {
      var text = safeString(node.textContent);
      return text.indexOf(labelText) !== -1 && node.querySelector(selector);
    });

    if (!wrapper) {
      return;
    }

    var control = wrapper.querySelector(selector);
    if (control && !control.id) {
      control.id = id;
    }
  }

  function annotateRestaurantForm() {
    var submitButton = Array.from(document.querySelectorAll("button")).find(function (button) {
      return safeString(button.textContent).indexOf("Tisch reservieren") !== -1 ||
        safeString(button.textContent).indexOf("Wird gesendet") !== -1;
    });

    if (!submitButton) {
      return;
    }

    var root = submitButton.closest("div");
    while (root && root.querySelectorAll("input").length < 4) {
      root = root.parentElement;
    }
    if (!root) {
      return;
    }

    root.setAttribute("data-restaurant-form", "true");
    submitButton.setAttribute("data-restaurant-submit", "true");
    annotateControlByLabel(root, "Name", "input[type='text']", "restaurant-guest-name");
    annotateControlByLabel(root, "Datum", "input[type='date']", "restaurant-date");
    annotateControlByLabel(root, "Uhrzeit", "select", "restaurant-time");
    annotateControlByLabel(root, "Anzahl Personen", "input[type='number']", "restaurant-persons");
    annotateControlByLabel(root, "Telefon", "input[type='tel']", "restaurant-phone");
    annotateControlByLabel(root, "E-Mail", "input[type='email']", "restaurant-email");
    annotateControlByLabel(root, "Besondere Wünsche", "textarea", "restaurant-special-requests");
  }

  function annotateHotelForm() {
    var headings = Array.from(document.querySelectorAll("h1, h2, h3"));
    var hotelHeading = headings.find(function (heading) {
      var text = safeString(heading.textContent);
      return text.indexOf("Wann möchten Sie kommen") !== -1 ||
        text.indexOf("Wählen Sie Ihr Apartment") !== -1 ||
        text.indexOf("Geben Sie Ihre Daten ein") !== -1 ||
        text.indexOf("Buchungsübersicht") !== -1;
    });

    if (!hotelHeading) {
      return;
    }

    var root = hotelHeading.closest("div");
    while (root && root.querySelectorAll("input, select").length < 3) {
      root = root.parentElement;
    }
    if (!root) {
      return;
    }

    root.setAttribute("data-booking-form", "true");
    annotateControlByLabel(root, "Anreise", "input[type='date']", "booking-check-in");
    annotateControlByLabel(root, "Abreise", "input[type='date']", "booking-check-out");
    annotateControlByLabel(root, "Erwachsene", "select", "booking-adults");
    annotateControlByLabel(root, "Kinder", "select", "booking-children");
    annotateControlByLabel(root, "E-Mail Adresse", "input[type='email']", "booking-email");
    annotateControlByLabel(root, "Telefonnummer", "input[type='tel']", "booking-phone");
    annotateControlByLabel(root, "Straße & Hausnr.", "input[type='text']", "booking-address");

    var roomButtons = Array.from(root.querySelectorAll("button")).filter(function (button) {
      return safeString(button.textContent).indexOf("Apartment") !== -1 ||
        safeString(button.textContent).indexOf("Suite") !== -1;
    });
    if (roomButtons.length > 0) {
      roomButtons.forEach(function (button, index) {
        button.setAttribute("data-room-option", String(index + 1));
      });
    }
  }

  function annotateTagungForm() {
    var heading = Array.from(document.querySelectorAll("h1, h2, h3")).find(function (node) {
      return safeString(node.textContent).indexOf("Vielen Dank") === -1 &&
        safeString(node.textContent).indexOf("Tagung") !== -1;
    });
    if (!heading) {
      return;
    }

    var root = heading.closest("main") || heading.closest("section") || heading.closest("div");
    if (!root) {
      return;
    }
    root.setAttribute("data-tagung-form", "true");
  }

  function annotateForms() {
    annotateRestaurantForm();
    annotateHotelForm();
    annotateTagungForm();
  }

  function startAnnotations() {
    annotateForms();
    if (observer) {
      observer.disconnect();
    }
    observer = new MutationObserver(function () {
      annotateForms();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAnnotations, { once: true });
  } else {
    startAnnotations();
  }

  window.__dasElbIntegrationReady = true;
})();
