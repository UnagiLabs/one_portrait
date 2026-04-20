module one_portrait::registry;

use sui::table::Table;

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

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(REGISTRY {}, ctx);
}

#[test_only]
public fun current_unit_count_for_testing(registry: &Registry): u64 {
    sui::table::length(&registry.current_units)
}
