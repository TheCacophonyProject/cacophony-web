declare namespace Cypress {
  interface Chainable {
    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkVisits(
      userName: string,
      deviceName: string,
      expectedVisits: import("../types").TestComparableVisit[],
    ): Chainable<Element>;

    /**
     * check the visits returned match the listed visits specified. Only the specified information will be checked.
     *
     * Please note:  visits must be listed in order of oldest to newest start dates.
     *
     */
    checkVisitTags(
      userName: string,
      deviceName: string,
      expectedTags: string[],
    ): Chainable<Element>;
  }
}
