#[test_only]
module one_portrait::registry_tests;

use std::unit_test::assert_eq;
use one_portrait::registry::{Self, AdminCap, Registry};
use sui::test_scenario;

#[test]
fun init_creates_admin_cap_and_shared_registry() {
    let publisher = @0xA11CE;
    let mut scenario = test_scenario::begin(publisher);

    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let registry = scenario.take_shared<Registry>();

    assert_eq!(registry::current_unit_count_for_testing(&registry), 0);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}
