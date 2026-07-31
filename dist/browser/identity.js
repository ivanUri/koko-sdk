export function definePersona(persona) {
    if (!persona.name.trim())
        throw new TypeError("persona.name must not be empty");
    if (persona.profile && persona.profileId) {
        throw new TypeError("persona cannot define both profile and profileId");
    }
    return Object.freeze({
        ...persona,
        geolocation: persona.geolocation ? Object.freeze({ ...persona.geolocation }) : undefined,
        viewport: persona.viewport ? Object.freeze({ ...persona.viewport }) : undefined,
        extraHTTPHeaders: persona.extraHTTPHeaders
            ? Object.freeze({ ...persona.extraHTTPHeaders })
            : undefined,
    });
}
export function personaContextOptions(persona) {
    return {
        locale: persona.locale,
        timezoneId: persona.timezoneId,
        geolocation: persona.geolocation,
        viewport: persona.viewport,
        extraHTTPHeaders: persona.extraHTTPHeaders,
    };
}
//# sourceMappingURL=identity.js.map