module one_portrait::registry;

use sui::table::{Self as table, Table};

public struct REGISTRY has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct Registry has key {
    id: UID,
    current_units: Table<u16, ID>,
}

fun init(_witness: REGISTRY, ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    let registry = Registry {
        id: object::new(ctx),
        current_units: sui::table::new(ctx),
    };

    transfer::transfer(admin_cap, tx_context::sender(ctx));
    transfer::share_object(registry);
}

public(package) fun current_unit_id(registry: &Registry, athlete_id: u16): Option<ID> {
    if (table::contains(&registry.current_units, athlete_id)) {
        option::some(*table::borrow(&registry.current_units, athlete_id))
    } else {
        option::none()
    }
}

public(package) fun set_current_unit_if_missing(
    registry: &mut Registry,
    athlete_id: u16,
    unit_id: ID,
): bool {
    if (table::contains(&registry.current_units, athlete_id)) {
        false
    } else {
        table::add(&mut registry.current_units, athlete_id, unit_id);
        true
    }
}

public(package) fun set_current_unit(registry: &mut Registry, athlete_id: u16, unit_id: ID) {
    if (table::contains(&registry.current_units, athlete_id)) {
        *table::borrow_mut(&mut registry.current_units, athlete_id) = unit_id;
    } else {
        table::add(&mut registry.current_units, athlete_id, unit_id);
    }
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(REGISTRY {}, ctx);
}

#[test_only]
public fun current_unit_count_for_testing(registry: &Registry): u64 {
    table::length(&registry.current_units)
}
